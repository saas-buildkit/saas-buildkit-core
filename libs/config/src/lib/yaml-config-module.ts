import { TypedConfigModule, fileLoader } from 'nest-typed-config';
import { ROOT_CONFIG_ALIAS_TOKEN } from './constants';
import { SetupConfigOptions } from './vo/setup-config-options';
import { getExistingFilePaths } from './utils/get-existing-file-paths';
import { ClassConstructor } from 'class-transformer';

export function setupYamlBaseConfigModule(
  baseDir: string,
  rootSchemaClass: ClassConstructor<unknown>,
  options?: SetupConfigOptions,
) {
  const existingFilePaths = getExistingFilePaths(
    baseDir,
    options?.folderName,
    options?.baseFileName,
    options?.profiles,
  );

  const dynamicModule = TypedConfigModule.forRoot({
    schema: rootSchemaClass,
    isGlobal: true,
    load: existingFilePaths.map((filePath) => {
      return fileLoader({
        absolutePath: filePath,
        ignoreEnvironmentVariableSubstitution: false,
      });
    }),
  });

  return {
    ...dynamicModule,
    providers: [
      ...(dynamicModule.providers || []),
      {
        provide: ROOT_CONFIG_ALIAS_TOKEN,
        useExisting: rootSchemaClass,
      },
    ],
    exports: [...(dynamicModule.exports || []), ROOT_CONFIG_ALIAS_TOKEN],
  };
}
