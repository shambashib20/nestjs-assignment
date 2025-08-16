import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue, // ✅ marked as readonly
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>, // ✅ marked as readonly
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    //  fixed!
    const now = new Date();

    try {
      const overdueTasks = await this.tasksRepository.find({
        where: {
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
        select: ['id', 'title', 'dueDate'], // fetch only needed fields
      });

      if (overdueTasks.length === 0) {
        this.logger.log('✅ No overdue tasks found');
        return;
      }

      const jobs = overdueTasks.map(task => ({
        name: 'mark-overdue',
        data: { taskId: task.id, dueDate: task.dueDate },
        opts: { removeOnComplete: true, attempts: 3 },
      }));

      await this.taskQueue.addBulk(jobs);

      this.logger.log(`Found ${overdueTasks.length} overdue tasks — queued for processing`);
    } catch (err: unknown) {
      this.logger.error(
        `Failed to check overdue tasks: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.logger.debug('Overdue tasks check completed');
    }
  }
} 