import { GenericContainer } from 'testcontainers';
import {
  DEFAULT_START_LOCALSTACK_OPTIONS,
  StartLocalstackOptions,
} from './vo/localstack/start-localstack-options';
import { StartedLocalstack } from './vo/localstack/started-localstack';
import { LocalstackStartedConfig } from './vo/localstack/localstack-config';
import { setTestEnvironmentForLocalstack } from './env/set-localstack-env-variables';

export async function startLocalstack(
  opts?: Partial<StartLocalstackOptions>,
): Promise<StartedLocalstack> {
  // eslint-disable-next-line no-console
  console.time(`start localstack`);
  const options = {
    ...DEFAULT_START_LOCALSTACK_OPTIONS,
    ...opts,
  };

  const container = await new GenericContainer(
    `${options.imageName}:${options.imageTag}`,
  )
    .withExposedPorts(...options.ports)
    .withEnvironment({
      SERVICES: options.services.join(','),
      DOCKER_HOST: 'unix:///var/run/docker.sock',
    })
    .withBindMounts([
      {
        source: '/var/run/docker.sock',
        target: '/var/run/docker.sock',
      },
    ])
    .start();

  // eslint-disable-next-line no-console
  console.timeEnd(`start localstack`);

  const localstackConfig: LocalstackStartedConfig = {
    // eslint-disable-next-line unicorn/no-array-reduce
    ports: options.ports.reduce(
      (acc, port) => {
        // eslint-disable-next-line security/detect-object-injection
        acc[port] = container.getMappedPort(port);
        return acc;
      },
      {} as { [key in number]: number },
    ),
    mainPort: container.getMappedPort(4566),
    host: 'localhost',
  };

  await setTestEnvironmentForLocalstack(localstackConfig);

  return {
    container,
    localstackConfig,
  };
}
