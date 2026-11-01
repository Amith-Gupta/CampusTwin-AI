import sys
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from app.config import Config
from app.database import init_db, SessionLocal

def create_app(config_class=Config):
    """Factory creating configured Flask application instance."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Logging setup
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)]
    )

    # Enable CORS for frontend Vite dev server and production clients
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"]
    )

    # Initialize Database
    init_db()

    # Session teardown cleanup
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        if SessionLocal is not None:
            SessionLocal.remove()

    # Register Blueprints
    from app.routes.health import health_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.rooms import rooms_bp
    from app.routes.detection import detection_bp
    from app.routes.occupancy import occupancy_bp
    from app.routes.energy import energy_bp
    from app.routes.alerts import alerts_bp
    from app.routes.seed import seed_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp, url_prefix="/api")
    app.register_blueprint(rooms_bp, url_prefix="/api")
    app.register_blueprint(detection_bp, url_prefix="/api")
    app.register_blueprint(occupancy_bp, url_prefix="/api")
    app.register_blueprint(energy_bp, url_prefix="/api")
    app.register_blueprint(alerts_bp, url_prefix="/api")
    app.register_blueprint(seed_bp, url_prefix="/api")

    # Root route for direct browser visits to backend
    @app.route("/")
    def index():
        return jsonify({
            "service": "CampusTwin AI - Backend REST API",
            "version": "1.0.0",
            "status": "online",
            "message": "CampusTwin AI Vision & Intelligence Backend is running successfully.",
            "frontend_url": "http://localhost:5173",
            "endpoints": {
                "health": "/api/health",
                "dashboard_summary": "/api/dashboard/summary",
                "rooms": "/api/rooms",
                "live_detection_frame": "/api/detection/frame",
                "video_upload": "/api/detection/upload",
                "forecast": "/api/forecast",
                "energy_summary": "/api/energy/summary",
                "alerts": "/api/alerts",
                "recommendations": "/api/recommendations",
                "reset_seed_data": "/api/seed/reset"
            },
            "hint": "Open the frontend dashboard in your browser at: http://localhost:5173"
        })

    # Error Handlers
    @app.errorhandler(400)
    def bad_request(err):
        return jsonify({"status": "error", "message": "Bad request format."}), 400

    @app.errorhandler(404)
    def not_found(err):
        return jsonify({"status": "error", "message": "API resource not found."}), 404

    @app.errorhandler(413)
    def request_entity_too_large(err):
        return jsonify({"status": "error", "message": "File exceeds the 50 MB upload limit."}), 413

    @app.errorhandler(500)
    def internal_server_error(err):
        return jsonify({"status": "error", "message": "An internal server error occurred."}), 500

    return app

_default_app = None

def __getattr__(name):
    """Provides fallback for Gunicorn discovery so both app:app and wsgi:app work cleanly."""
    if name == "app":
        global _default_app
        if _default_app is None:
            _default_app = create_app()
        return _default_app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

