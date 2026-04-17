pub type AppResult<T> = Result<T, String>;

pub fn to_user_error(message: impl Into<String>) -> String {
    message.into()
}
