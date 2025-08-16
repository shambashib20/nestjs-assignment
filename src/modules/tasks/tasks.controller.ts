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
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    const task = await this.tasksService.findOne(id);

    if (!task) {
      // Inefficient error handling: Revealing internal details
      throw new HttpException(`Task with ID ${id} not found in the database`, HttpStatus.NOT_FOUND);
    }

    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // No validation if task exists before update
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string) {
    // No validation if task exists before removal
    // No status code returned for success
    return this.tasksService.remove(id);
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
