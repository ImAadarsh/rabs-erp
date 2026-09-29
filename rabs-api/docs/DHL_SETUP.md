# DHL Express (MyDHL API) setup for RABS

## Auth that works

MyDHL API uses **HTTP Basic Auth**:

- Username = **API Key**
- Password = **API Secret**

Developer portal email/password **cannot** call the API (returns `401 Invalid Credentials`).

Base URLs:

| Mode | URL |
|------|-----|
| Test / sandbox | `https://express.api.dhl.com/mydhlapi/test` |
| Production | `https://express.api.dhl.com/mydhlapi` |

Products used by RABS:

- **Shipment** — `POST /shipments` (create + label PDF)
- **Tracking** — `GET /shipments/{trackingNumber}/tracking`
- **Label image** — `GET /shipments/{trackingNumber}/get-image`
- **Cancel/void** — `DELETE /shipments/{trackingNumber}` (only before pickup; surface DHL errors if unsupported)

## Create API keys under app `rabs_erp`

1. Register / log in at [developer.dhl.com](https://developer.dhl.com).
2. Open **Get Access** for **DHL Express – MyDHL API**.
3. Choose credentials for an existing platform / your own solution; app name **rabs_erp**.
4. Request services: **Shipment**, **Tracking**, **Rating** (optional), **Pickup** (optional).
5. After DHL approval (often next business day; production may take ~24h), open **Apps → rabs_erp**.
6. Reveal **API Key** and **API Secret**.
7. You also need your **DHL Express account number** from your DHL sales/ops contact.

## Env vars (never commit real secrets)

Local: `rabs-api/.env`  
VPS: `/var/www/rabs-api/.env`

```bash
DHL_API_KEY=
DHL_API_SECRET=
DHL_ACCOUNT_NUMBER=
DHL_MODE=test          # or live
DHL_DEFAULT_PRODUCT_CODE=N
DHL_SHIPPER_NAME=
DHL_SHIPPER_COMPANY=
DHL_SHIPPER_PHONE=
DHL_SHIPPER_EMAIL=
DHL_SHIPPER_ADDRESS1=
DHL_SHIPPER_CITY=
DHL_SHIPPER_POSTAL=
DHL_SHIPPER_COUNTRY=GB
```

After editing VPS `.env`: `pm2 restart rabs-api --update-env`

## ERP / panel usage

- Order detail: **Ship with DHL**, **Print label**, **Track**, **Cancel**
- Fulfillment → Shipments: `/fulfillment/shipments`
- Fulfillment → Tracking: `/fulfillment/tracking`
- API: `/api/fulfillment/dhl/*`

Creates rows in `order_shipments` and syncs carrier/tracking onto existing `b2b_shipments` when present. B2B portal shows a DHL tracking link when the order has a DHL-looking tracking number.

## Migrate

```bash
cd rabs-api && npm run migrate:016
```
