import uvicorn
import argparse
import os
from api.main import app
from api.v1.auth.oidc import is_platform_mode

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the FastAPI server")
    parser.add_argument(
        "--port", type=int, required=True, help="Port number to run the server on"
    )
    parser.add_argument(
        "--reload", type=str, default="false", help="Reload the server on code changes"
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        help="Uvicorn log level",
    )
    args = parser.parse_args()
    reload = args.reload == "true"
    host = "127.0.0.1"

    logging_options = {}
    if is_platform_mode():
        from ngl_observability import build_uvicorn_log_config

        # Platform middleware owns bounded business/error logs and already
        # excludes successful health probes; avoid duplicate Uvicorn access logs.
        logging_options["log_config"] = build_uvicorn_log_config(
            service_name="pptmate", environment=os.getenv("APP_ENV", "development")
        )

    uvicorn.run(
        "api.main:app",
        host=host,
        port=args.port,
        log_level=args.log_level,
        reload=reload,
        **logging_options,
    )
