-- Product import job history (Import Channels)
CREATE TABLE IF NOT EXISTS product_import_jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NULL,
    source_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NULL,
    status ENUM('pending', 'preview', 'processing', 'completed', 'failed') DEFAULT 'pending',
    options JSON NULL,
    summary JSON NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_org_created (organization_id, created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
