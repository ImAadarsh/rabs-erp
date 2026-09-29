import {
  Shield, Boxes, Package2, ShoppingCart, Truck, Wallet, Landmark,
  Users, Headset, Megaphone, Share2, BarChart3, Settings, Store, FolderKanban
} from 'lucide-react';

export const modules = [
  {
    slug: 'iam', name: 'Identity & Access', icon: Shield, color: '#E3070F',
    description: 'Users, Roles, API Keys, Audit'
  },
  {
    slug: 'catalog', name: 'Product & Catalog', icon: Package2, color: '#E3070F',
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
    slug: 'b2b', name: 'B2B Sale Channel', icon: Store, color: '#E3070F',
    description: 'Wholesale portal, retailers, pricing, orders'
  },
  {
    slug: 'fulfillment', name: 'Fulfillment & 3PL', icon: Truck, color: '#0A0A0A',
    description: 'Pick/Pack, Shipments, Tracking'
  },
  {
    slug: 'finance', name: 'Payments & Invoicing', icon: Wallet, color: '#E3070F',
    description: 'Gateways, Payments, Invoices'
  },
  {
    slug: 'accounting', name: 'Finance & Accounting', icon: Landmark, color: '#E3070F',
    description: 'UK ledger, VAT, invoices, bills, payroll journals'
  },
  {
    slug: 'hr', name: 'HR & Payroll', icon: Users, color: '#E3070F',
    description: 'Employees, immigration/RTW, leave, payroll, pension, recruitment'
  },
  {
    slug: 'crm', name: 'CRM & Service', icon: Headset, color: '#E3070F',
    description: 'Accounts, Leads, Pipeline, Integrations, Tickets & Tiers'
  },
  {
    slug: 'projects', name: 'Project Management', icon: FolderKanban, color: '#E3070F',
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


