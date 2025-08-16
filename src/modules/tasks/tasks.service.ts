import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeleteResult, QueryRunner, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private static readonly MAX_LIMIT = 100;

  constructor(
    @InjectRepository(Task) private readonly tasksRepository: Repository<Task>,
    @InjectQueue('task-processing') private readonly taskQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = queryRunner.manager.create(Task, {
        ...createTaskDto,
        userId,
      });

      const savedTask = await queryRunner.manager.save(task);

      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });

      await queryRunner.commitTransaction();

      this.logger.log(`Task ${savedTask.id} created by user ${userId}`);
      return savedTask;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();

      if (err instanceof Error) {
        this.logger.error(`Task creation failed for user ${userId}: ${err.message}`, err.stack);

        // if it's a query error, return a 400
        if ((err as any).code === '23505') {
          // duplicate key example (Postgres)
          throw new BadRequestException('Task already exists');
        }
        throw new InternalServerErrorException(err.message); // keep real cause
      } else {
        this.logger.error(`Task creation failed for user ${userId}`, JSON.stringify(err));
        throw new InternalServerErrorException('Unknown error while creating task');
      }
    } finally {
      await queryRunner.release(); // ensure release
    }
  }

  async findAll(
    filter: { status?: TaskStatus; priority?: TaskPriority },
    page = 1,
    limit = 10,
  ): Promise<{ data: Task[]; count: number }> {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, TasksService.MAX_LIMIT) : 10;
    try {
      const qb = this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user');

      if (filter.status) {
        qb.andWhere('task.status = :status', { status: filter.status });
      }
      if (filter.priority) {
        qb.andWhere('task.priority = :priority', { priority: filter.priority });
      }

      qb.skip((safePage - 1) * safeLimit).take(safeLimit);

      const [data, count] = await qb.getManyAndCount();
      return { data, count };
    } catch (err: any) {
      throw new InternalServerErrorException('Failed to fetch tasks');
    }
  }

  async findOne(id: string): Promise<Task> {
    //Fixed!
    try {
      const task = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });
      if (!task) {
        this.logger.warn(`Task with ID ${id} not found`);
        throw new NotFoundException('Task not found');
      }
      return task;
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      if (err instanceof Error) {
        this.logger.error(`Unexpected error while fetching task ${id}: ${err.message}`, err.stack);
      } else {
        this.logger.error(
          `Unexpected non-error thrown while fetching task ${id}`,
          JSON.stringify(err),
        );
      }
      throw new InternalServerErrorException('Unable to fetch task at this time');
    }
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const task = await queryRunner.manager.findOne(Task, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!task) {
        this.logger.warn(`Attempt to update non-existing task ${id}`);
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      const updated = this.tasksRepository.merge(task, updateTaskDto);

      const savedTask = await queryRunner.manager.save(Task, updated);

      // If status changed, enqueue update event
      if (originalStatus !== savedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: savedTask.id,
            status: savedTask.status,
          });
        } catch (queueErr) {
          this.logger.error(
            `Failed to enqueue status update for task ${savedTask.id}: ${(queueErr as Error).message}`,
            (queueErr as Error).stack,
          );
          // don’t fail request if queue push fails
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Task ${savedTask.id} updated successfully`);
      return savedTask;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();

      if (err instanceof NotFoundException) {
        throw err;
      }
      if (err instanceof Error) {
        this.logger.error(`Error updating task ${id}: ${err.message}`, err.stack);
      } else {
        this.logger.error(`Unexpected non-error during task update for ${id}`, JSON.stringify(err));
      }

      throw new InternalServerErrorException('Unable to update task at this time');
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      // Single DB call: delete by id
      const result: DeleteResult = await this.tasksRepository.delete(id);

      if (result.affected === 0) {
        return false;
      }

      this.logger.log(`Task with ID ${id} deleted successfully`);
      return true;
    } catch (error) {
      const err = error as Error; // 👈 cast
      this.logger.error(`Error deleting task with ID ${id}`, err.stack);
      throw err;
    }
  }
  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }
}
