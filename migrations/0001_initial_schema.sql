-- Table 1: Events
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,          -- ISO Format: YYYY-MM-DD (AD)
    event_time TEXT,                   -- 24-hr Format: HH:mm (nullable)
    created_by_platform TEXT NOT NULL,  -- 'line' or 'discord'
    created_by_user TEXT,              -- Display name or user ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Alert Logs (prevents duplicate spam on restart or re-run)
CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,          -- 'countdown' (D-14, 7, 3, 1, 0) or 'event_time'
    milestone_days INTEGER,            -- 14, 7, 3, 1, or 0 (NULL if alert_type = 'event_time')
    platform TEXT NOT NULL,            -- 'line' or 'discord'
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE(event_id, alert_type, milestone_days, platform)
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_alert_logs_lookup ON alert_logs(event_id, alert_type, milestone_days, platform);
