# TaskFlow API – Coding Challenge Solution

## 🌟 Introduction
This is my solution for the **TaskFlow API backend challenge**.  
The goal was to take a half-done task management API and make it **production-ready** by fixing problems, improving performance, and adding missing features.

In short:
- Cleaned up the code  
- Fixed design issues  
- Made the API faster and safer  
- Added clear patterns for real-world usage  

---

## 🛠 Tech Stack
- **Language**: TypeScript  
- **Framework**: NestJS  
- **Database & ORM**: PostgreSQL + TypeORM  
- **Queue System**: BullMQ with Redis  
- **Package Manager**: Bun  
- **API Style**: REST with JSON  
- **Testing**: Bun test  

---

## 🚀 What I Did / Key Improvements

### ✅ General Fixes
- Replaced direct repository usage inside controllers with **service-based access** (removed anti-pattern).  
- Added **error handling and logging** to critical parts of the system.  
- Improved **code readability** by following NestJS best practices.  
- Marked injected services and repositories as `readonly` for safety.  

### ✅ Database & Querying
- Fixed **N+1 query problem** in list endpoints by using `QueryBuilder` and joins.  
- Added **pagination and filtering** for tasks (by status and priority).  
- Added **safe defaults** for `page` and `limit`.  
- Added ordering to **overdue task checks** so tasks are processed in the correct order.  

### ✅ Overdue Task Processing
- Implemented an **hourly cron job** that finds overdue tasks.  
- Added **bulk queueing** instead of enqueuing jobs one-by-one (better performance).  
- Added **transaction support** so tasks are marked as `OVERDUE` in the database before being queued.  
- Added **idempotency check** so overdue tasks are not reprocessed every hour.  

### ✅ Batch Operations
- Improved `POST /tasks/batch` to avoid N+1 queries.  
- Added support for **bulk update and delete** using `IN (:...ids)` queries.  
- Each batch operation now returns a clear **success/failure response**.  

### ✅ Authentication & Seeding
- Authentication endpoints for login and registration.  
- Database seeder with two default users:  
  - **Admin** → `admin@example.com / admin123`  
  - **User** → `user@example.com / user123`  

---

## 📖 Endpoints Overview

### 🔐 Authentication
- `POST /auth/register` – Register a new user  
- `POST /auth/login` – Login with email and password  

### 📌 Tasks
- `GET /tasks` – List tasks with filtering + pagination  
- `GET /tasks/:id` – Get task details  
- `POST /tasks` – Create a task  
- `PATCH /tasks/:id` – Update a task  
- `DELETE /tasks/:id` – Delete a task  
- `POST /tasks/batch` – Batch update or delete tasks  

---

## 🔑 My Biggest Improvements
1. **Performance** → Removed N+1 queries, added query builder, bulk operations.  
2. **Cron Job** → Made it production-ready with bulk queueing, transactions, idempotency.  
3. **Reliability** → Better error handling, structured logging, service-first design.  
4. **Scalability** → Added pagination and filters to `GET /tasks`.  
5. **Security & Safety** → Marked dependencies as readonly, validated enums.  

---

## 🏁 Conclusion
The **TaskFlow API** is now a **clean, scalable, and production-ready service**.  
It has:
- A proper structure  
- Safe queries  
- Background processing with queues  
- A working authentication system  


