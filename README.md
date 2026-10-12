# CRM — Customer Relationship Management System

A full-stack Customer Relationship Management (CRM) application built to manage leads, clients, follow-ups, products, quotations, invoices, and payments in one place.

The project includes an Angular frontend and a Node.js/Express backend with MongoDB for data storage.

## Features

- **Authentication & Authorization** — User login, JWT-based authentication, and role-based access control.
- **User Management** — Manage company users and their roles.
- **Lead Management** — Create, view, update, and track leads through different stages.
- **Client Management** — Maintain client contact and business information.
- **Follow-up Management** — Schedule and track calls, meetings, emails, and other follow-up activities.
- **Product Management** — Manage products, services, pricing, and GST rates.
- **Quotation Management** — Create quotations with line items, discounts, taxes, and totals.
- **Invoice Management** — Generate invoices and track outstanding balances and payment status.
- **Payment Management** — Record payments and update invoice balances.
- **Dashboard** — View business summaries, recent records, and upcoming follow-ups.
- **Reports** — Review leads, quotations, invoices, payments, and follow-up activity.
- **Pagination & Filtering** — Browse records with server-side pagination and filters.
- **Activity Logs** — Track important actions performed within the CRM.
- **Company Data Isolation** — Scope company records to the authenticated user's company.

## Tech Stack

### Frontend
- Angular
- TypeScript
- RxJS
- HTML and CSS

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Tokens (JWT)
- bcryptjs

### Development Tools
- Git and GitHub
- npm
- Angular CLI

## Project Structure

```text
crm/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   ├── common/
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   └── app/
│   ├── angular.json
│   └── package.json
│
├── .gitignore
└── README.md
```

*The structure above is illustrative; adjust it to match the actual folders and files in your repository.*

## Getting Started

### Prerequisites

Install the following:

- [Node.js](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community) or a MongoDB connection string
- [Angular CLI](https://angular.dev/tools/cli)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Replace the URL with your actual GitHub repository URL.

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory. Use the existing `.env.example` as a template.

Example configuration:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/crm_db
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
CLIENT_URL=http://localhost:4200
```

Use a strong, private JWT secret. Never commit your actual `.env` file.

Start the backend using the script defined in `backend/package.json`. For example:

```bash
npm run dev
```

### 3. Set up the frontend

Open another terminal:

```bash
cd frontend
npm install
```

Start the Angular development server using the script defined in `frontend/package.json`. Typically:

```bash
npm start
```

Alternatively, if the project uses Angular CLI directly:

```bash
npx ng serve
```

Open the local URL printed by Angular CLI, commonly `http://localhost:4200`.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Backend server port |
| `NODE_ENV` | Application environment |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRES_IN` | JWT expiration duration |
| `CLIENT_URL` | Frontend origin allowed by CORS |

Check the backend configuration and `.env.example` for the exact variables required by your implementation.

## API Overview

The backend API is organized around CRM resources. The following routes represent the intended module structure; verify the implemented endpoints in the source code.

| Resource | Example route |
|---|---|
| Authentication | `/api/auth` |
| Users | `/api/users` |
| Leads | `/api/leads` |
| Clients | `/api/clients` |
| Follow-ups | `/api/follow-ups` |
| Products | `/api/products` |
| Quotations | `/api/quotations` |
| Invoices | `/api/invoices` |
| Payments | `/api/payments` |
| Dashboard | `/api/dashboard` |
| Reports | `/api/reports` |
| Activity Logs | `/api/activity-logs` |

## Security

- Authenticate protected API requests.
- Enforce role-based authorization on restricted operations.
- Scope tenant-specific queries to the authenticated company.
- Validate incoming data on the backend.
- Hash user passwords before storing them.
- Keep secrets and environment files out of version control.
- Avoid exposing sensitive user fields in API responses.

## Development

Run the frontend and backend in separate terminals during local development.

Use the scripts defined in each `package.json` for starting the application, running tests, and creating production builds.

## Future Improvements

Potential improvements include:

- Export reports to CSV, Excel, or PDF.
- Email notifications and reminders.
- Invoice and quotation PDF generation.
- Payment gateway integration.
- Enhanced analytics and reporting.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test your changes.
5. Submit a pull request.

## License

No license has been specified yet. Add a license before permitting reuse or redistribution of this project.

---

**Built with Angular, Node.js, Express.js, and MongoDB.**
