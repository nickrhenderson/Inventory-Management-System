"""Services package: business logic and integrations.

Each module in here is a "service" - it depends on the database/ data-access
layer and (for integration services) external systems. The apis/ layer calls
into these services rather than talking to the database directly.

    - backup_service  - Google Drive backup / restore (moved from google_drive_backup.py)
    - server_service  - local live "Connect Phone" LAN server (moved from live_server.py)
    - image_service   - product image storage on disk
    - updater_service - self-update logic for the compiled executable
"""
