mod commands;
mod error;
mod models;
mod repositories;
mod services;

use services::deployment_executor::DeploymentControlState;
use services::process_runner::BuildProcessState;
use services::remote_log_session_service::RemoteLogSessionState;
use services::terminal_session_service::TerminalManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            services::app_logger::log_info(app.handle(), "app.start", "应用启动");
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(BuildProcessState::default())
        .manage(DeploymentControlState::default())
        .manage(RemoteLogSessionState::default())
        .manage(TerminalManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::project::parse_maven_project,
            commands::project::analyze_project_dependencies,
            commands::environment::detect_environment,
            commands::environment::load_environment_settings,
            commands::environment::save_environment_settings,
            commands::environment::save_last_project_path,
            commands::environment::remove_saved_project_path,
            commands::build::build_command_preview,
            commands::build::start_build,
            commands::build::cancel_build,
            commands::filesystem::open_path_in_explorer,
            commands::filesystem::scan_build_artifacts,
            commands::filesystem::delete_build_artifact,
            commands::git::check_git_status,
            commands::git::fetch_git_updates,
            commands::git::pull_git_updates,
            commands::git::switch_git_branch,
            commands::git::list_git_commits,
            commands::history::list_build_history,
            commands::history::save_build_history,
            commands::template::list_templates,
            commands::template::save_template,
            commands::template::delete_template,
            commands::release::list_release_templates,
            commands::release::save_release_template,
            commands::release::delete_release_template,
            commands::release::list_release_records,
            commands::release::save_release_record,
            commands::release::delete_release_record,
            commands::deployment::list_server_profiles,
            commands::deployment::save_server_profile,
            commands::deployment::delete_server_profile,
            commands::deployment::list_deployment_profiles,
            commands::deployment::save_deployment_profile,
            commands::deployment::delete_deployment_profile,
            commands::deployment::list_deployment_tasks,
            commands::deployment::start_deployment,
            commands::deployment::cancel_deployment,
            commands::deployment::delete_deployment_task,
            commands::deployment::test_server_connection,
            commands::service_ops::list_service_runtime_configs,
            commands::service_ops::save_service_runtime_config,
            commands::service_ops::delete_service_runtime_config,
            commands::service_ops::list_service_operation_histories,
            commands::service_ops::start_service_restart,
            commands::service_ops::start_service_health_check,
            commands::service_ops::start_remote_log_session,
            commands::service_ops::stop_remote_log_session,
            commands::server_ops::list_server_groups,
            commands::server_ops::save_server_group,
            commands::server_ops::delete_server_group,
            commands::server_ops::list_favorite_paths,
            commands::server_ops::save_favorite_path,
            commands::server_ops::delete_favorite_path,
            commands::server_ops::list_common_commands,
            commands::server_ops::save_common_command,
            commands::server_ops::delete_common_command,
            commands::server_ops::list_log_sources,
            commands::server_ops::save_log_source,
            commands::server_ops::delete_log_source,
            commands::server_ops::list_highlight_rules,
            commands::server_ops::save_highlight_rule,
            commands::server_ops::delete_highlight_rule,
            commands::server_ops::execute_remote_command,
            commands::server_ops::list_remote_files,
            commands::server_ops::delete_remote_file,
            commands::server_ops::rename_remote_file,
            commands::server_ops::create_remote_directory,
            commands::server_ops::read_remote_log_lines,
            commands::server_ops::create_terminal_session,
            commands::server_ops::write_terminal_input,
            commands::server_ops::read_terminal_output,
            commands::server_ops::resize_terminal,
            commands::server_ops::close_terminal_session,
            commands::server_ops::check_terminal_alive,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
