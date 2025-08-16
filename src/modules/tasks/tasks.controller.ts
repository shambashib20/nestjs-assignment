import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
  UseInterceptors,
  InternalServerErrorException,
  Req,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpCode,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { TaskFilterDto } from './dto/task-filter.dto';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';

interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

// Done! Implemented the authguard! Now moving forward for rate limiting!

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard, RolesGuard)
@Roles('admin', 'user')
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  private readonly logger = new Logger(TasksController.name);
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto, @Req() req: Request & { user: JwtPayload }) {
    try {
      const userId = req.user.sub;
      this.logger.log(`User ${userId} is attempting to create a task`);

      const task = await this.tasksService.create(createTaskDto, userId);

      this.logger.log(`Task ${task.id} successfully created by user ${userId}`);
      return task;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        this.logger.warn(`Validation failed: ${JSON.stringify(err.getResponse())}`);
        throw err;
      }

      if (err instanceof Error) {
        this.logger.error(`Unexpected error in task creation: ${err.message}`, err.stack);
      } else {
        this.logger.error(`Unexpected non-error thrown: ${JSON.stringify(err)}`);
      }

      throw new InternalServerErrorException('Something went wrong while creating the task');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  async findAll(@Query() filterDto: TaskFilterDto) {
    const { status, priority, page, limit } = filterDto;

    try {
      const result = await this.tasksService.findAll({ status, priority }, page, limit);
      return {
        data: result.data,
        count: result.count,
        page,
        limit,
      };
    } catch {
      throw new InternalServerErrorException('Unable to list tasks at this time');
    }
  }
  // @Get('stats')
  // @ApiOperation({ summary: 'Get task statistics' })
  // async getStats() {
  //   // Inefficient approach: N+1 query problem
  //   const tasks = await this.taskRepository.find();

  //   // Inefficient computation: Should be done with SQL aggregation
  //   const statistics = {
  //     total: tasks.length,
  //     completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
  //     inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
  //     pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
  //     highPriority: tasks.filter(t => t.priority === TaskPriority.HIGH).length,
  //   };

  //   return statistics;
  // }

  @Get(':id')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    try {
      this.logger.log(`Fetching task with ID ${id}`);
      const task = await this.tasksService.findOne(id);
      this.logger.log(`Successfully fetched task ${task.id}`);
      return task;
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        this.logger.warn(`Task ${id} not found`);
        throw err;
      }

      if (err instanceof Error) {
        this.logger.error(
          `Unexpected error in controller while fetching task ${id}: ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.error(
          `Non-error thrown in controller while fetching task ${id}`,
          JSON.stringify(err),
        );
      }

      throw new InternalServerErrorException('Something went wrong while retrieving the task');
    }
  }

  @Patch(':id')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    try {
      this.logger.log(`User attempting to update task ${id}`);
      const updatedTask = await this.tasksService.update(id, updateTaskDto);
      this.logger.log(`Task ${updatedTask.id} updated successfully`);
      return updatedTask;
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        this.logger.warn(`Update failed: Task ${id} not found`);
        throw err;
      }

      if (err instanceof Error) {
        this.logger.error(
          `Unexpected error in controller while updating task ${id}: ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.error(
          `Unexpected non-error in controller during task update ${id}`,
          JSON.stringify(err),
        );
      }

      throw new InternalServerErrorException('Something went wrong while updating the task');
    }
  }

  @Delete(':id')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Delete a task' })
  @HttpCode(HttpStatus.NO_CONTENT) // 204 - resource deleted successfully
  async remove(@Param('id') id: string) {
    try {
      const deleted = await this.tasksService.remove(id);

      if (!deleted) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      return;
    } catch (error: unknown) {
      const err = error as Error;

      this.logger.error(`Failed to delete task with ID ${id}`, err.stack);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `An error occurred while deleting the task with ID ${id}`,
      );
    }
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() operations: { tasks: string[]; action: string }) {
    // Inefficient batch processing: Sequential processing instead of bulk operations
    const { tasks: taskIds, action } = operations;
    const results = [];

    // N+1 query problem: Processing tasks one by one
    for (const taskId of taskIds) {
      try {
        let result;

        switch (action) {
          case 'complete':
            result = await this.tasksService.update(taskId, { status: TaskStatus.COMPLETED });
            break;
          case 'delete':
            result = await this.tasksService.remove(taskId);
            break;
          default:
            throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
        }

        results.push({ taskId, success: true, result });
      } catch (error) {
        // Inconsistent error handling
        results.push({
          taskId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }
}
