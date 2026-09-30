import {
  Shield, Boxes, Package2, ShoppingCart, Truck, Wallet, Landmark,
  Users, Headset, Megaphone, Share2, BarChart3, Settings, Store, FolderKanban, Ruler
} from 'lucide-react';

export const modules = [
  {
    slug: 'rabs', name: 'RABS Jobs (Enquiry → Fitting)', icon: Ruler, color: '#A31F24',
    description: 'Enquiries, measuring, quotes, deposits, fitting, invoices'
  },
  {
    slug: 'iam', name: 'Identity & Access', icon: Shield, color: '#A31F24',
    description: 'Users, Roles, API Keys, Audit'
  },
  {
    slug: 'catalog', name: 'Product & Catalog', icon: Package2, color: '#A31F24',
    description: 'Products, Variants, Pricing, Channels'
  },
  {
    slug: 'inventory', name: 'Inventory', icon: Boxes, color: '#0A0A0A',
    description: 'Warehouses, Bins, Stock, ASN/GRN'
  },
  {
    slug: 'orders', name: 'Orders & Customers', icon: ShoppingCart, color: '#0A0A0A',
    description: 'Orders, Customers, Returns'
  },
  {
    slug: 'b2b', name: 'B2B Sale Channel', icon: Store, color: '#A31F24',
    description: 'Wholesale portal, retailers, pricing, orders'
  },
  {
    slug: 'fulfillment', name: 'Fulfillment & 3PL', icon: Truck, color: '#0A0A0A',
    description: 'Pick/Pack, Shipments, Tracking'
  },
  {
    slug: 'finance', name: 'Payments & Invoicing', icon: Wallet, color: '#A31F24',
    description: 'Gateways, Payments, Invoices'
  },
  {
    slug: 'accounting', name: 'Finance & Accounting', icon: Landmark, color: '#A31F24',
    description: 'UK ledger, VAT, invoices, bills, payroll journals'
  },
  {
    slug: 'hr', name: 'HR & Payroll', icon: Users, color: '#A31F24',
    description: 'Employees, immigration/RTW, leave, payroll, pension, recruitment'
  },
  {
    slug: 'crm', name: 'CRM & Service', icon: Headset, color: '#A31F24',
    description: 'Accounts, Leads, Pipeline, Integrations, Tickets & Tiers'
  },
  {
    slug: 'projects', name: 'Project Management', icon: FolderKanban, color: '#A31F24',
    description: 'Jobs, work orders, tasks, milestones, staff schedule & progress'
  },
  {
    slug: 'marketing', name: 'Marketing & Affiliates', icon: Megaphone, color: '#0A0A0A',
    description: 'Email campaigns, Segments, Coupons, Affiliates'
  },
  {
    slug: 'social', name: 'Social Media', icon: Share2, color: '#0A0A0A',
    description: 'Posts, inbox, ads, insights'
  },
  {
    slug: 'analytics', name: 'Reporting & Analytics', icon: BarChart3, color: '#0A0A0A',
    description: 'Reports, Dashboards, Exports'
  },
  {
    slug: 'system', name: 'System & Config', icon: Settings, color: '#0A0A0A',
    description: 'Settings, Templates, Webhooks'
  }
];


