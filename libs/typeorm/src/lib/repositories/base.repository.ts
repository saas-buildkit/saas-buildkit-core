import { Logger } from '@nestjs/common';
import {
  DataSource,
  DeepPartial,
  DeleteResult,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  In,
  IsNull,
  Not,
  QueryRunner,
  Repository,
  SaveOptions,
  UpdateResult,
} from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { BaseEntityHelper } from '../entities/entity-helper';
import {
  paginate,
  PaginateConfig,
  Paginated,
  PaginateQuery,
} from 'nestjs-paginate';

export abstract class BaseRepository<
  ENTITY extends BaseEntityHelper,
  ID extends keyof ENTITY,
> extends Repository<ENTITY> {
  private readonly logger: Logger = new Logger(BaseRepository.name);

  protected constructor(
    protected entityTarget: EntityTarget<ENTITY>,
    protected dataSource: DataSource,
    public idFieldName: ID,
  ) {
    const entityManager = dataSource.createEntityManager();
    super(entityTarget, entityManager);
  }

  /**
   * update or create entity entirely
   * return type is not safe here because of typeorm
   * it doesn't really return all fields, only updated ones
   * */
  async createOrUpdate(entity: DeepPartial<ENTITY>): Promise<ENTITY> {
    const e = this.create(entity);
    return this.save(e);
  }

  /**
   * update or create entity entirely
   * */
  async createOrUpdateWithReload(entity: DeepPartial<ENTITY>): Promise<ENTITY> {
    const e = this.create(entity);
    const result = await this.save(e);
    const foundEntity = await this.findSingle(result[this.idFieldName]);

    // can't imagine a situation where find won't work after successful save
    return foundEntity ?? /* istanbul ignore next */ result;
  }

  async findAllPaginated(
    query: PaginateQuery,
    config: PaginateConfig<ENTITY>,
  ): Promise<Paginated<ENTITY>> {
    const where = this.presetWhereOptions(config.where ?? {});

    const updatedConfig = {
      ...config,
      where: Object.keys(where).length > 0 ? where : undefined,
    } satisfies PaginateConfig<ENTITY>;

    return paginate(query, this, updatedConfig as PaginateConfig<ENTITY>);
  }

  async findSingle(
    id: ENTITY[ID],
    withDeleted = false,
    where: FindOptionsWhere<ENTITY> = {},
  ): Promise<ENTITY | null> {
    return await this.findOne(
      this.presetDefaultFilterOptions({
        where: {
          ...where,
          id,
        },
        withDeleted,
      }),
    );
  }

  async findAllByIds(
    ids: ENTITY[ID][],
    where: FindOptionsWhere<ENTITY> = {},
  ): Promise<ENTITY[]> {
    return this.find(
      this.presetDefaultFilterOptions({
        where: {
          ...where,
          id: In(ids),
        },
      }),
    );
  }

  async archive(id: ENTITY[ID], version: number) {
    const result = await this.update(
      this.presetDefaultWhereOptions({
        id,
        version,
        deletedAt: IsNull(),
      } as FindOptionsWhere<NonNullable<ENTITY>>),
      {
        deletedAt: new Date(),
      } as unknown as QueryDeepPartialEntity<ENTITY>,
    );

    return result.affected === 1;
  }

  async unarchive(id: ENTITY[ID], version: number) {
    const result = await this.update(
      this.presetDefaultWhereOptions({
        id,
        version,
        deletedAt: Not(IsNull()),
      } as FindOptionsWhere<ENTITY>),
      // todo typeorm typing issue, created an issue in typeorm
      // https://github.com/typeorm/typeorm/issues/10155
      {
        // eslint-disable-next-line unicorn/no-null
        deletedAt: null,
      } as unknown as QueryDeepPartialEntity<ENTITY>,
    );

    return result.affected === 1;
  }

  async runInTransaction(
    tranFunc: (queryRunner: QueryRunner) => Promise<void>,
    isolationLevel: IsolationLevel = 'READ COMMITTED',
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.startTransaction(isolationLevel);

    try {
      await tranFunc(queryRunner);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * override section below
   * */

  override async findOne(
    options: FindOneOptions<ENTITY>,
  ): Promise<ENTITY | null> {
    return super.findOne(this.presetDefaultFilterOptions(options));
  }

  override async find(options?: FindManyOptions<ENTITY>): Promise<ENTITY[]> {
    return super.find(this.presetDefaultFilterOptions(options));
  }

  override async count(options?: FindManyOptions<ENTITY>): Promise<number> {
    return super.count(this.presetDefaultFilterOptions(options));
  }

  override async findOneOrFail(
    options: FindOneOptions<ENTITY>,
  ): Promise<ENTITY> {
    return super.findOneOrFail(this.presetDefaultFilterOptions(options));
  }

  override async findAndCountBy(
    where: FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  ): Promise<[ENTITY[], number]> {
    return super.findAndCountBy(this.presetWhereOptions(where));
  }

  override async decrement(
    conditions: FindOptionsWhere<ENTITY>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return super.decrement(
      this.presetDefaultWhereOptions(conditions),
      propertyPath,
      value,
    );
  }

  /**
   * doesn't support
   * */
  override async update(
    criteria:
      | string
      | string[]
      | number
      | number[]
      | Date
      | Date[]
      | FindOptionsWhere<ENTITY>,
    partialEntity: QueryDeepPartialEntity<ENTITY>,
  ): Promise<UpdateResult> {
    return super.update(this.presetIdWhereOptions(criteria), partialEntity);
  }

  override async increment(
    conditions: FindOptionsWhere<ENTITY>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return super.increment(
      this.presetDefaultWhereOptions(conditions),
      propertyPath,
      value,
    );
  }

  override async countBy(
    where: FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  ): Promise<number> {
    return super.countBy(this.presetWhereOptions(where));
  }

  override async findOneBy(
    where: FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  ): Promise<ENTITY | null> {
    return super.findOneBy(this.presetWhereOptions(where));
  }

  override async delete(
    criteria:
      | string
      | string[]
      | number
      | number[]
      | Date
      | Date[]
      | FindOptionsWhere<ENTITY>,
  ): Promise<DeleteResult> {
    return super.delete(this.presetIdWhereOptions(criteria));
  }

  async deleteById(id: ENTITY[ID]): Promise<DeleteResult> {
    return super.delete(
      this.presetIdWhereOptions({
        [this.idFieldName]: id,
      }),
    );
  }

  override async findAndCount(
    options?: FindManyOptions<ENTITY>,
  ): Promise<[ENTITY[], number]> {
    return super.findAndCount(this.presetDefaultFilterOptions(options));
  }

  override async findOneByOrFail(
    where: FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  ): Promise<ENTITY> {
    return super.findOneByOrFail(this.presetWhereOptions(where));
  }

  override async findBy(
    where: FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  ): Promise<ENTITY[]> {
    return super.findBy(this.presetWhereOptions(where));
  }

  /**
   * @deprecated The method should not be used
   */
  override async softDelete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _criteria:
      | string
      | string[]
      | number
      | number[]
      | Date
      | Date[]
      | FindOptionsWhere<ENTITY>,
  ): Promise<UpdateResult> {
    this.logger
      .warn(`softDelete method is not recommended to use in repository ${this.metadata.name}
    Because it doesn't with versioning. Use archive instead.`);

    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  /**
   * @deprecated The method should not be used
   */
  override async softRemove<T extends DeepPartial<ENTITY>>(): Promise<
    T & ENTITY
  > {
    this.logger
      .warn(`softRemove method is not recommended to use in repository ${this.metadata.name}
    Because it doesn't with versioning. Use archive instead.`);
    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  /**
   * @deprecated The method should not be used
   */
  override async restore(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _criteria:
      | string
      | string[]
      | number
      | number[]
      | Date
      | Date[]
      | FindOptionsWhere<ENTITY>,
  ): Promise<UpdateResult> {
    this.logger
      .warn(`restore method is not recommended to use in repository ${this.metadata.name}
    Because it doesn't with versioning. Use archive instead.`);
    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  /**
   * @deprecated The method should not be used
   */
  override async recover<T extends DeepPartial<ENTITY>>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _entity: T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: SaveOptions,
  ): Promise<T & ENTITY> {
    this.logger
      .warn(`recover method is not recommended to use in repository ${this.metadata.name}
    Because it doesn't with versioning. Use archive instead.`);
    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  /**
   * don't use ever, cls is not working with this method
   * @deprecated The method should not be used
   * */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async findByIds(_ids: unknown[]): Promise<ENTITY[]> {
    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  /**
   * don't use ever, cls is not working with this method
   * @deprecated The method should not be used
   * */
  // eslint-disable-next-line sonarjs/no-identical-functions
  override async findOneById(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _id: number | string | Date,
  ): Promise<ENTITY | null> {
    throw new Error(
      `Method is deprecated don't use it. It's also not working with cls`,
    );
  }

  protected presetIdWhereOptions(
    criteria:
      | string
      | string[]
      | number
      | number[]
      | Date
      | Date[]
      | FindOptionsWhere<ENTITY>
      | object,
  ): FindOptionsWhere<ENTITY> {
    if (
      criteria instanceof Date ||
      typeof criteria === 'string' ||
      typeof criteria === 'number'
    ) {
      return this.presetDefaultWhereOptions({
        [this.idFieldName]: criteria,
      } as FindOptionsWhere<ENTITY>);
    } else if (Array.isArray(criteria)) {
      return this.presetDefaultWhereOptions({
        [this.idFieldName]: In(criteria as unknown[]),
      } as FindOptionsWhere<ENTITY>);
    } else {
      return this.presetDefaultWhereOptions(criteria);
    }
  }

  protected presetDefaultFilterOptions<
    T extends FindOneOptions<ENTITY> | FindManyOptions<ENTITY> | undefined,
  >(currentOptions: T): T {
    if (!currentOptions) {
      return {
        where: {
          ...this.presetDefaultWhereOptions({}),
        },
      } as T;
    }

    currentOptions.where = Array.isArray(currentOptions.where)
      ? currentOptions.where.map((condition) => {
          return this.presetDefaultWhereOptions(condition);
        })
      : this.presetDefaultWhereOptions(currentOptions.where);

    return currentOptions;
  }

  protected presetWhereOptions<
    T extends FindOptionsWhere<ENTITY> | FindOptionsWhere<ENTITY>[],
  >(where: T): T {
    return Array.isArray(where)
      ? (where.map((condition) => {
          return this.presetDefaultWhereOptions(condition);
        }) as T)
      : (this.presetDefaultWhereOptions(
          where as FindOptionsWhere<ENTITY>,
        ) as T);
  }

  protected presetDefaultWhereOptions<
    T extends FindOptionsWhere<ENTITY> | undefined,
  >(currentOptions: T): T {
    return currentOptions;
  }
}
