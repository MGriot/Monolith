from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Monolith Project Planner"
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 50

    # Bearer key for the /mcp endpoint. Empty = MCP is NOT mounted.
    MCP_API_KEY: str = ""

    # SMTP Configuration
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_STARTTLS: bool = False
    SMTP_VERIFY_TLS: bool = True
    SMTP_TIMEOUT: int = 10
    APP_BASE_URL: str = "http://localhost:8080"
    EMAILS_FROM_EMAIL: str = "noreply@monolith.local"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
