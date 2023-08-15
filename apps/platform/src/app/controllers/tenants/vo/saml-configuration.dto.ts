import {
  IsBooleanLocalized,
  IsStringCombinedLocalized,
  IsUrlLocalized,
} from '@saas-buildkit/validation';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { IdpMappingDto } from '../../roles/vo/idp-mapping.dto';

export class SetupSamlConfiguration {
  @IsUrlLocalized()
  entryPoint!: string;

  @IsStringCombinedLocalized()
  certificate!: string;

  @Type(/* istanbul ignore next */ () => IdpMappingDto)
  @ValidateNested()
  fieldsMapping!: IdpMappingDto;

  @IsBooleanLocalized()
  enabled!: boolean;
}
