mod commands;
mod error;
mod models;
mod repositories;
mod services;

use repositories::storage::DatabasePool;
use services::process_runner::BuildProcessState;
use tauri::Listener;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            services::app_logger::log_info(app.handle(), "app.start", "应用启动");

            // Create a native splash window with app branding
            let _splash = tauri::WebviewWindowBuilder::new(
                app,
                "splash",
                tauri::WebviewUrl::App("splash.html".into()),
            )
            .title("")
            .decorations(false)
            .inner_size(480.0, 300.0)
            .resizable(false)
            .center()
            .visible(true)
            .build()?;

            // When the frontend signals it's ready, close splash and show main window
            let handle = app.handle().clone();
            app.listen("app-ready", move |_| {
                if let Some(sw) = handle.get_webview_window("splash") {
                    if let Err(e) = sw.close() {
                        eprintln!("Warning: failed to close splash window: {}", e);
                    }
                }
                if let Some(mw) = handle.get_webview_window("main") {
                    if let Err(e) = mw.show() {
                        eprintln!("Warning: failed to show main window: {}", e);
                    }
                    if let Err(e) = mw.set_focus() {
                        eprintln!("Warning: failed to focus main window: {}", e);
                    }
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .filter(|_| false)
                        .build(),
                )?;
            }

            if let Some(state) = app.try_state::<BuildProcessState>() {
                let max = repositories::settings_repo::load(app.handle())
                    .ok()
                    .and_then(|s| s.max_concurrent_builds.map(|v| v as usize));
                state.set_max_concurrent(max);
            }

            let build_state = app.state::<BuildProcessState>().inner().clone();
            if let Some(main_window) = app.get_webview_window("main") {
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        // 后台杀进程，避免阻塞关闭路径
                        let state = build_state.clone();
                        std::thread::spawn(move || state.terminate_all());
                    }
                });
            }

            Ok(())
        })
        .manage(DatabasePool::new())
        .manage(BuildProcessState::default())
        .invoke_handler(tauri::generate_handler![
            commands::project::parse_maven_project,
            commands::project::analyze_project_dependencies,
            commands::environment::detect_environment,
            commands::environment::load_environment_settings,
            commands::environment::save_environment_settings,
            commands::environment::save_last_project_path,
            commands::environment::remove_saved_project_path,
            commands::environment::bind_project_profile,
            commands::environment::unbind_project_profile,
            commands::environment::scan_system_jdks,
            commands::environment::add_jdk_to_registry,
            commands::environment::remove_jdk_from_registry,
            commands::environment::set_default_jdk,
            commands::build::build_command_preview,
            commands::build::start_build,
            commands::build::cancel_build,
            commands::build::set_max_concurrent_builds,
            commands::build::get_max_concurrent_builds,
            commands::build::get_running_build_count,
            commands::dependency::detect_dependency_conflicts,
            commands::dependency::generate_exclusion_code,
            commands::dependency::generate_bulk_exclusion_code,
            commands::filesystem::open_path_in_explorer,
            commands::filesystem::scan_build_artifacts,
            commands::filesystem::delete_build_artifact,
            commands::filesystem::check_files_exist,
            commands::clipboard::copy_file_to_clipboard,
            commands::git::check_git_status,
            commands::git::fetch_git_updates,
            commands::git::pull_git_updates,
            commands::git::switch_git_branch,
            commands::git::list_git_commits,
            commands::history::list_build_history,
            commands::history::save_build_history,
            commands::history::delete_build_history,
            commands::template::list_templates,
            commands::template::save_template,
            commands::template::delete_template,
            commands::updater::check_for_app_update,
            commands::updater::download_app_update,
            commands::updater::install_cached_app_update,
            commands::updater::install_app_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
