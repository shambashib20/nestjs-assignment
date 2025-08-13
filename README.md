# TaskFlow API - Senior Backend Engineer Coding Challenge Solution

## Introduction

This repository contains the solution to the TaskFlow API coding challenge. The goal of this challenge is to refactor and enhance a partially implemented task management API, addressing various architectural, performance, and security issues to create a production-ready application.

## Tech Stack

- **Language**: TypeScript
- **Framework**: NestJS
- **ORM**: TypeORM with PostgreSQL
- **Queue System**: BullMQ with Redis
- **API Style**: REST with JSON
- **Package Manager**: Bun
- **Testing**: Bun test

## Getting Started

### Prerequisites

- Node.js (v16+)
- Bun (latest version)
- PostgreSQL
- Redis

### Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Configure environment variables by copying `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # Update the .env file with your database and Redis connection details
   ```
4. Database Setup:

   Ensure your PostgreSQL database is running, then create a database:

   ```bash
   # Using psql
   psql -U postgres
   CREATE DATABASE taskflow;
   \q

   # Or using createdb
   createdb -U postgres taskflow
   ```

   Build the TypeScript files to ensure the migrations can be run:

   ```bash
   bun run build
   ```

5. Run database migrations:

   ```bash
   # Option 1: Standard migration (if "No migrations are pending" but tables aren't created)
   bun run migration:run

   # Option 2: Force table creation with our custom script
   bun run migration:custom
   ```

   Our custom migration script will:

   - Try to run formal migrations first
   - If no migrations are executed, it will directly create the necessary tables
   - It provides detailed logging to help troubleshoot database setup issues

6. Seed the database with initial data:
   ```bash
   bun run seed
   ```
7. Start the development server:
   ```bash
   bun run start:dev
   ```

### Troubleshooting Database Issues

If you continue to have issues with database connections:

1. Check that PostgreSQL is properly installed and running:

   ```bash
   # On Linux/Mac
   systemctl status postgresql
   # or
   pg_isready

   # On Windows
   sc query postgresql
   ```

2. Verify your database credentials by connecting manually:

   ```bash
   psql -h localhost -U postgres -d taskflow
   ```

3. If needed, manually create the schema from the migration files:
   - Look at the SQL in `src/database/migrations/`
   - Execute the SQL manually in your database

### Default Users

The seeded database includes two users:

1. Admin User:

   - Email: admin@example.com
   - Password: admin123
   - Role: admin

2. Regular User:
   - Email: user@example.com
   - Password: user123
   - Role: user

## API Endpoints

The API should expose the following endpoints:

### Authentication Routes

- `POST /auth/login` - Authenticate a user
- `POST /auth/register` - Register a new user

### Tasks assigned to me

- `GET /tasks` - List tasks with filtering and pagination
- `GET /tasks/:id` - Get task details
- `POST /tasks` - Create a task
- `PATCH /tasks/:id` - Update a task
- `DELETE /tasks/:id` - Delete a task
- `POST /tasks/batch` - Batch operations on tasks
