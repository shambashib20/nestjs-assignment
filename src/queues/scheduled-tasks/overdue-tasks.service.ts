import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Task } from '@modules/tasks/entities/task.entity';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue, // ✅ readonly
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>, // ✅ readonly
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    const now = new Date();

    try {
      // ✅ fetch only tasks still pending
      const overdueTasks = await this.tasksRepository.find({
        where: { dueDate: LessThan(now), status: TaskStatus.PENDING },
        order: { dueDate: 'ASC' },
        select: ['id', 'title', 'dueDate'],
      });

      if (overdueTasks.length === 0) {
        this.logger.log('✅ No overdue tasks found');
        return;
      }

      // ✅ Use transaction to update + enqueue atomically
      await this.tasksRepository.manager.transaction(async manager => {
        for (const task of overdueTasks) {
          await manager.update(Task, task.id, { status: TaskStatus.OVERDUE });

          await this.taskQueue.add(
            'mark-overdue',
            { taskId: task.id, dueDate: task.dueDate },
            {
              jobId: `overdue-${task.id}`,
              removeOnComplete: true,
              attempts: 3,
            },
          );
        }
      });

      this.logger.log(`✅ ${overdueTasks.length} tasks marked OVERDUE & queued for processing`);
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
