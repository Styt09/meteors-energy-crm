PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 phone TEXT, role TEXT NOT NULL CHECK(role IN ('admin','manager','salesperson','accountant','installer','customer')),
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, customer_id TEXT,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT, phone TEXT, whatsapp TEXT, email TEXT,
 address TEXT, city TEXT, category TEXT, gstin TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leads (
 id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, company TEXT, phone TEXT, whatsapp TEXT, email TEXT,
 address TEXT, city TEXT, category TEXT, capacity_kw REAL, monthly_bill REAL, source TEXT,
 assigned_to TEXT REFERENCES users(id), enquiry_date TEXT, followup_date TEXT,
 status TEXT NOT NULL DEFAULT 'New', notes TEXT, customer_id TEXT REFERENCES customers(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quotations (
 id TEXT PRIMARY KEY, quotation_no TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES customers(id),
 lead_id TEXT REFERENCES leads(id), capacity_kw REAL, panel_brand TEXT, inverter_brand TEXT,
 structure_amount REAL DEFAULT 0, cable_amount REAL DEFAULT 0, protection_amount REAL DEFAULT 0,
 installation_amount REAL DEFAULT 0, transport_amount REAL DEFAULT 0, subtotal REAL DEFAULT 0,
 discount REAL DEFAULT 0, gst_percent REAL DEFAULT 0, total REAL DEFAULT 0, validity_date TEXT,
 status TEXT NOT NULL DEFAULT 'Draft', terms TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, project_no TEXT NOT NULL UNIQUE, customer_id TEXT REFERENCES customers(id),
 quotation_id TEXT REFERENCES quotations(id), location TEXT, capacity_kw REAL, value REAL DEFAULT 0,
 manager_id TEXT REFERENCES users(id), installation_team TEXT, start_date TEXT, expected_date TEXT,
 completed_date TEXT, stage TEXT NOT NULL DEFAULT 'New Project', progress INTEGER NOT NULL DEFAULT 0,
 notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS followups (
 id TEXT PRIMARY KEY, lead_id TEXT REFERENCES leads(id), customer_id TEXT REFERENCES customers(id),
 assigned_to TEXT REFERENCES users(id), due_at TEXT NOT NULL, note TEXT, outcome TEXT,
 completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, invoice_no TEXT, customer_id TEXT REFERENCES customers(id),
 project_id TEXT REFERENCES projects(id), total_amount REAL NOT NULL DEFAULT 0,
 amount REAL NOT NULL DEFAULT 0, payment_date TEXT, mode TEXT, reference TEXT,
 status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory (
 id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT, unit TEXT DEFAULT 'pcs',
 quantity REAL NOT NULL DEFAULT 0, purchase_price REAL NOT NULL DEFAULT 0, supplier TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activities (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), entity_type TEXT NOT NULL,
 entity_id TEXT, action TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id), project_id TEXT REFERENCES projects(id),
 file_key TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT, uploaded_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_requests (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), subject TEXT NOT NULL,
 message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(followup_date);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(due_at, completed);
