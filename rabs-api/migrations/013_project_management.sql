-- 013 Project Management (jobs, work orders, tasks, stages, schedule, milestones)
-- Idempotent / non-destructive. deploy may re-run.

-- Project Manager role (like CRM SALES_REP)
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Project Manager', 'PROJECT_MANAGER', 'Project management: jobs, tasks, scheduling', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'PROJECT_MANAGER' AND organization_id = 1);

CREATE TABLE IF NOT EXISTS pm_projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NULL,
  customer_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  scope TEXT NULL,
  objectives TEXT NULL,
  status ENUM('draft', 'active', 'on_hold', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  start_date DATE NULL,
  end_date DATE NULL,
  budget DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  owner_user_id BIGINT UNSIGNED NULL,
  progress_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  production_ready TINYINT(1) NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_projects_org (organization_id),
  KEY idx_pm_projects_status (organization_id, status),
  KEY idx_pm_projects_owner (owner_user_id),
  KEY idx_pm_projects_customer (customer_id),
  KEY idx_pm_projects_code (organization_id, code),
  CONSTRAINT fk_pm_projects_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_projects_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_pm_projects_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_pm_projects_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_deliverables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('pending', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
  due_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_deliverables_project (project_id),
  KEY idx_pm_deliverables_status (project_id, status),
  CONSTRAINT fk_pm_deliverables_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_work_stages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_stages_org (organization_id),
  KEY idx_pm_stages_project (project_id, position),
  CONSTRAINT fk_pm_stages_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_stages_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_work_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('draft', 'scheduled', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'draft',
  assignee_user_id BIGINT UNSIGNED NULL,
  stage_id BIGINT UNSIGNED NULL,
  scheduled_start DATETIME NULL,
  scheduled_end DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_wo_org (organization_id),
  KEY idx_pm_wo_project (project_id),
  KEY idx_pm_wo_status (organization_id, status),
  KEY idx_pm_wo_assignee (assignee_user_id),
  KEY idx_pm_wo_stage (stage_id),
  CONSTRAINT fk_pm_wo_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_wo_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_wo_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_pm_wo_stage FOREIGN KEY (stage_id) REFERENCES pm_work_stages (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  work_order_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  assignee_user_id BIGINT UNSIGNED NULL,
  status ENUM('todo', 'in_progress', 'blocked', 'done', 'cancelled') NOT NULL DEFAULT 'todo',
  priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  due_date DATE NULL,
  estimate_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  logged_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  progress_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_tasks_org (organization_id),
  KEY idx_pm_tasks_project (project_id),
  KEY idx_pm_tasks_wo (work_order_id),
  KEY idx_pm_tasks_status (organization_id, status),
  KEY idx_pm_tasks_assignee (assignee_user_id),
  KEY idx_pm_tasks_due (due_date),
  CONSTRAINT fk_pm_tasks_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_tasks_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_tasks_wo FOREIGN KEY (work_order_id) REFERENCES pm_work_orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_pm_tasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_task_dependencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  depends_on_task_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pm_task_dep (task_id, depends_on_task_id),
  KEY idx_pm_task_dep_on (depends_on_task_id),
  CONSTRAINT fk_pm_task_dep_task FOREIGN KEY (task_id) REFERENCES pm_tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_task_dep_on FOREIGN KEY (depends_on_task_id) REFERENCES pm_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_milestones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  due_date DATE NULL,
  completed_at DATETIME NULL,
  status ENUM('pending', 'achieved', 'missed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_milestones_project (project_id),
  KEY idx_pm_milestones_due (due_date),
  CONSTRAINT fk_pm_milestones_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_schedule_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  task_id BIGINT UNSIGNED NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pm_sched_org (organization_id),
  KEY idx_pm_sched_user (user_id, start_at),
  KEY idx_pm_sched_project (project_id),
  KEY idx_pm_sched_task (task_id),
  CONSTRAINT fk_pm_sched_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_sched_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_sched_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_sched_task FOREIGN KEY (task_id) REFERENCES pm_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pm_project_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner', 'manager', 'member', 'viewer') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pm_project_member (project_id, user_id),
  KEY idx_pm_members_user (user_id),
  CONSTRAINT fk_pm_members_project FOREIGN KEY (project_id) REFERENCES pm_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
