//! Tauri commands — thin wrappers only: validate → call service → return
//! data or a typed error payload (RULES R1.2). Long-running operations run
//! on blocking tasks so commands never block the UI thread (RULES R3.5).

use tauri::{AppHandle, Manager, State};

use crate::error::{AppError, AppErrorPayload};
use crate::library::query::{self, Query};
use crate::library::service;
use crate::library::{
    CategoryDto, DocumentDto, ImportResult, RescanResult, SearchPage, SettingsDto,
};
use crate::{Covers, Db, TauriSink};

/// Run a service call on a blocking thread with the app's shared state.
async fn background<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&Db, &Covers, &TauriSink) -> Result<T, AppErrorPayload> + Send + 'static,
) -> Result<T, AppErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        let covers = app.state::<Covers>();
        let sink = TauriSink::new(app.clone());
        work(db.inner(), covers.inner(), &sink)
    })
    .await
    .map_err(|join_error| {
        AppError::Internal(format!("background job failed: {join_error}")).payload()
    })
    // The service call's own payload passes through unchanged.
    .and_then(std::convert::identity)
}

fn build_query(
    q: String,
    category_id: Option<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
) -> Query {
    let (sort_key, sort_dir) = query::parse_sort(&sort, &dir);
    Query {
        q,
        category_id,
        favorites_only,
        missing_only,
        sort: sort_key,
        sort_dir,
    }
}

// ------------------------------------------------------------------ import

#[tauri::command]
pub async fn library_import_paths(
    app: AppHandle,
    paths: Vec<String>,
    category_id: Option<i64>,
) -> Result<ImportResult, AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::import_paths(conn, sink, &covers.0, &paths, category_id))
    })
    .await
}

#[tauri::command]
pub async fn library_import_folder(
    app: AppHandle,
    dir: String,
    category_id: Option<i64>,
) -> Result<ImportResult, AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::import_folder(conn, sink, &covers.0, &dir, category_id))
    })
    .await
}

// ------------------------------------------------------------- search/list

// Flat argument lists here are the wire contract mirrored in `ui/src/api.ts`
// (spec §5.3.3); grouping them would change the command payload for no gain.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn library_search(
    app: AppHandle,
    db: State<'_, Db>,
    query: String,
    category_id: Option<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
    offset: i64,
    limit: i64,
) -> Result<SearchPage, AppErrorPayload> {
    let limit = limit.clamp(1, 500);
    let offset = offset.max(0);
    let query = build_query(query, category_id, favorites_only, missing_only, sort, dir);
    let covers_dir = app.state::<Covers>().0.dir.clone();
    db.with(move |conn| service::search_document(conn, &covers_dir, &query, offset, limit))
}

#[tauri::command]
pub fn library_ids(
    db: State<'_, Db>,
    query: String,
    category_id: Option<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
) -> Result<Vec<i64>, AppErrorPayload> {
    let query = build_query(query, category_id, favorites_only, missing_only, sort, dir);
    db.with(move |conn| query::ids(conn, &query))
}

// --------------------------------------------------------------- documents

#[tauri::command]
pub fn library_get_document(
    db: State<'_, Db>,
    app: AppHandle,
    id: i64,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    db.with(move |conn| service::get_document(conn, &covers_dir, id))
}

// Same wire-contract rationale as `library_search` above.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn library_update_document(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    title: String,
    author: String,
    notes: String,
    favorite: bool,
    category_ids: Vec<i64>,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    let sink = TauriSink::new(app);
    db.with(move |conn| {
        service::update_document(
            conn,
            &sink,
            &covers_dir,
            id,
            &service::DocumentEdit {
                title: &title,
                author: &author,
                notes: &notes,
                favorite,
                category_ids: &category_ids,
            },
        )
    })
}

#[tauri::command]
pub fn library_set_document_categories(
    app: AppHandle,
    db: State<'_, Db>,
    document_id: i64,
    category_ids: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| {
        service::set_document_categories(
            conn,
            &TauriSink::new(app.clone()),
            document_id,
            &category_ids,
        )
    })
}

#[tauri::command]
pub fn library_set_favorite(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    value: bool,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    let sink = TauriSink::new(app);
    db.with(move |conn| service::set_favorite(conn, &sink, &covers_dir, id, value))
}

#[tauri::command]
pub fn library_bulk_categories(
    app: AppHandle,
    db: State<'_, Db>,
    document_ids: Vec<i64>,
    add: Vec<i64>,
    remove: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| {
        service::bulk_categories(
            conn,
            &TauriSink::new(app.clone()),
            &document_ids,
            &add,
            &remove,
        )
    })
}

#[tauri::command]
pub async fn library_delete_document(app: AppHandle, ids: Vec<i64>) -> Result<(), AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::delete_documents(conn, sink, &covers.0, &ids, false))
    })
    .await
}

#[tauri::command]
pub async fn library_delete_document_and_file(
    app: AppHandle,
    ids: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::delete_documents(conn, sink, &covers.0, &ids, true))
    })
    .await
}

// ------------------------------------------------------------------ relink

#[tauri::command]
pub fn library_relink_document(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    new_path: String,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers = app.state::<Covers>();
    db.with(|conn| {
        service::relink_document(conn, &TauriSink::new(app.clone()), &covers.0, id, &new_path)
    })
}

// ------------------------------------------------------------------ rescan

#[tauri::command]
pub async fn library_rescan(app: AppHandle) -> Result<RescanResult, AppErrorPayload> {
    background(app, |db, covers, sink| {
        db.with(|conn| service::rescan(conn, sink, &covers.0, false))
    })
    .await
}

// -------------------------------------------------------------- categories

#[tauri::command]
pub fn categories_list(db: State<'_, Db>) -> Result<Vec<CategoryDto>, AppErrorPayload> {
    db.with(|conn| service::categories_list(conn))
}

#[tauri::command]
pub fn categories_create(db: State<'_, Db>, name: String) -> Result<CategoryDto, AppErrorPayload> {
    db.with(|conn| service::categories_create(conn, &name))
}

#[tauri::command]
pub fn categories_rename(
    db: State<'_, Db>,
    id: i64,
    name: String,
) -> Result<CategoryDto, AppErrorPayload> {
    db.with(|conn| service::categories_rename(conn, id, &name))
}

#[tauri::command]
pub fn categories_delete(db: State<'_, Db>, id: i64) -> Result<(), AppErrorPayload> {
    db.with(|conn| service::categories_delete(conn, id))
}

// -------------------------------------------------------------------- app

#[tauri::command]
pub fn app_get_settings(db: State<'_, Db>) -> Result<SettingsDto, AppErrorPayload> {
    db.with(|conn| service::get_settings(conn))
}

#[tauri::command]
pub fn app_set_setting(
    db: State<'_, Db>,
    key: String,
    value: String,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| service::set_setting(conn, &key, &value))
}

#[tauri::command]
pub fn app_open_document(app: AppHandle, id: i64) -> Result<(), AppErrorPayload> {
    let path = {
        let db = app.state::<Db>();
        db.with(|conn| service::open_target(conn, id))?
    };
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|error| {
        AppError::Io {
            path,
            message: error.to_string(),
        }
        .payload()
    })
}
