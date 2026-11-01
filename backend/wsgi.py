import os
import io
import sys
from app import create_app
from app.config import Config
from app.database import get_db
from app.models import Room

# Fix Windows console UTF-8 output if running locally
if sys.platform.startswith("win"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

app = create_app()

def auto_seed_if_empty():
    """Seeds initial demonstration dataset if database is completely empty."""
    try:
        db = next(get_db())
        if db.query(Room).count() == 0:
            print("[*] Database is empty. Seeding initial CampusTwin demonstration dataset...")
            from app.routes.seed import seed_demo_data
            with app.app_context():
                seed_demo_data()
            print("[*] Demonstration dataset successfully seeded.")
    except Exception as e:
        print(f"[!] Auto-seed note: {e}")

# Run seeding on startup
auto_seed_if_empty()

if __name__ == "__main__":
    port = int(os.getenv("PORT", Config.PORT))
    print(f"[*] CampusTwin AI WSGI starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=Config.DEBUG)
