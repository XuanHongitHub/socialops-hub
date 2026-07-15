import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import { CdpProfileSmokeDto, CdpRecipeDto, CdpScreenshotDto, CreateWorkflowRunDto, ExecuteWorkflowRunDto, ExtensionBridgeHeartbeatDto, ExtensionBridgeJobCompleteDto, ExtensionBridgeJobDto, ExtensionBridgeJobPollDto, ExtensionBridgeRegisterDto, ExtensionRecipeDto, GrokDeviceLoginPollDto, GrokDeviceLoginStartDto, ImportCookieAccountDto, ProviderRouteDto, SelectProviderAccountDto, SocialPublishDryRunDto, UpsertAutomationProfileDto, UpsertProviderAccountDto } from './providers.dto'
import { ProvidersService } from './providers.service'

@ApiTags('Me/Ai/Providers')
@Controller('ai/providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @ApiDoc({ summary: 'List provider registry' })
  @Get()
  async listProviders(@GetToken() token: TokenInfo) {
    return await this.providersService.listProviders(token.id)
  }

  @ApiDoc({ summary: 'List provider accounts' })
  @Get('/accounts')
  async listAccounts(@GetToken() token: TokenInfo) {
    return await this.providersService.listAccounts(token.id)
  }

  @ApiDoc({ summary: 'Create or update provider account', body: UpsertProviderAccountDto.schema })
  @Post('/accounts')
  async upsertAccount(@GetToken() token: TokenInfo, @Body() body: UpsertProviderAccountDto) {
    return await this.providersService.upsertAccount(token.id, body)
  }

  @ApiDoc({ summary: 'Import cookie provider account', body: ImportCookieAccountDto.schema })
  @Post('/accounts/import-cookie')
  async importCookieAccount(@GetToken() token: TokenInfo, @Body() body: ImportCookieAccountDto) {
    return await this.providersService.importCookieAccount(token.id, body)
  }

  @ApiDoc({ summary: 'Select provider account', body: SelectProviderAccountDto.schema })
  @Post('/accounts/select')
  async selectAccount(@GetToken() token: TokenInfo, @Body() body: SelectProviderAccountDto) {
    return await this.providersService.selectAccount(token.id, body)
  }

  @ApiDoc({ summary: 'Route provider operation with retry/fallback', body: ProviderRouteDto.schema })
  @Post('/accounts/route')
  async routeProvider(@GetToken() token: TokenInfo, @Body() body: ProviderRouteDto) {
    return await this.providersService.routeProvider(token.id, body)
  }

  @ApiDoc({ summary: 'Health check provider account' })
  @Post('/accounts/:id/health')
  async checkAccountHealth(@GetToken() token: TokenInfo, @Param('id') id: string) {
    return await this.providersService.checkAccountHealth(token.id, id)
  }

  @ApiDoc({ summary: 'Disable provider account' })
  @Patch('/accounts/:id/disable')
  async disableAccount(@GetToken() token: TokenInfo, @Param('id') id: string) {
    return await this.providersService.disableAccount(token.id, id)
  }


  @ApiDoc({ summary: 'Dry-run CDP browser profile smoke', body: CdpProfileSmokeDto.schema })
  @Post('/cdp/smoke')
  async smokeCdpProfile(@GetToken() token: TokenInfo, @Body() body: CdpProfileSmokeDto) {
    return await this.providersService.smokeCdpProfile(token.id, body)
  }

  @ApiDoc({ summary: 'Capture local CDP screenshot artifact', body: CdpScreenshotDto.schema })
  @Post('/cdp/screenshot')
  async captureCdpScreenshot(@GetToken() token: TokenInfo, @Body() body: CdpScreenshotDto) {
    return await this.providersService.captureCdpScreenshot(token.id, body)
  }

  @ApiDoc({ summary: 'Execute local CDP recipe with strict host guard', body: CdpRecipeDto.schema })
  @Post('/cdp/recipe')
  async executeCdpRecipe(@GetToken() token: TokenInfo, @Body() body: CdpRecipeDto) {
    return await this.providersService.executeCdpRecipe(token.id, body)
  }

  @ApiDoc({ summary: 'Dry-run social publish validation', body: SocialPublishDryRunDto.schema })
  @Post('/social/publish/dry-run')
  async dryRunSocialPublish(@GetToken() token: TokenInfo, @Body() body: SocialPublishDryRunDto) {
    return await this.providersService.dryRunSocialPublish(token.id, body)
  }

  @ApiDoc({ summary: 'List automation profiles' })
  @Get('/automation-profiles')
  async listAutomationProfiles(@GetToken() token: TokenInfo) {
    return await this.providersService.listAutomationProfiles(token.id)
  }

  @ApiDoc({ summary: 'Create automation profile', body: UpsertAutomationProfileDto.schema })
  @Post('/automation-profiles')
  async createAutomationProfile(@GetToken() token: TokenInfo, @Body() body: UpsertAutomationProfileDto) {
    return await this.providersService.createAutomationProfile(token.id, body)
  }

  @ApiDoc({ summary: 'Import extension automation recipe', body: ExtensionRecipeDto.schema })
  @Post('/extension/recipes')
  async importExtensionRecipe(@GetToken() token: TokenInfo, @Body() body: ExtensionRecipeDto) {
    return await this.providersService.importExtensionRecipe(token.id, body)
  }

  @ApiDoc({ summary: 'Dry-run extension automation recipe', body: ExtensionRecipeDto.schema })
  @Post('/extension/recipes/run')
  async runExtensionRecipe(@GetToken() token: TokenInfo, @Body() body: ExtensionRecipeDto) {
    return await this.providersService.runExtensionRecipe(token.id, body)
  }

  @ApiDoc({ summary: 'Register extension bridge session', body: ExtensionBridgeRegisterDto.schema })
  @Post('/extension/bridge/register')
  async registerExtensionBridge(@GetToken() token: TokenInfo, @Body() body: ExtensionBridgeRegisterDto) {
    return await this.providersService.registerExtensionBridge(token.id, body)
  }

  @ApiDoc({ summary: 'Update extension bridge heartbeat', body: ExtensionBridgeHeartbeatDto.schema })
  @Post('/extension/bridge/heartbeat')
  async heartbeatExtensionBridge(@GetToken() token: TokenInfo, @Body() body: ExtensionBridgeHeartbeatDto) {
    return await this.providersService.heartbeatExtensionBridge(token.id, body)
  }

  @ApiDoc({ summary: 'Queue extension bridge job', body: ExtensionBridgeJobDto.schema })
  @Post('/extension/bridge/jobs')
  async queueExtensionBridgeJob(@GetToken() token: TokenInfo, @Body() body: ExtensionBridgeJobDto) {
    return await this.providersService.queueExtensionBridgeJob(token.id, body)
  }

  @ApiDoc({ summary: 'Poll next extension bridge job', body: ExtensionBridgeJobPollDto.schema })
  @Post('/extension/bridge/jobs/next')
  async nextExtensionBridgeJob(@GetToken() token: TokenInfo, @Body() body: ExtensionBridgeJobPollDto) {
    return await this.providersService.nextExtensionBridgeJob(token.id, body)
  }

  @ApiDoc({ summary: 'Complete extension bridge job', body: ExtensionBridgeJobCompleteDto.schema })
  @Post('/extension/bridge/jobs/complete')
  async completeExtensionBridgeJob(@GetToken() token: TokenInfo, @Body() body: ExtensionBridgeJobCompleteDto) {
    return await this.providersService.completeExtensionBridgeJob(token.id, body)
  }

  @ApiDoc({ summary: 'List workflow runs' })
  @Get('/workflow-runs')
  async listWorkflowRuns(@GetToken() token: TokenInfo) {
    return await this.providersService.listWorkflowRuns(token.id)
  }

  @ApiDoc({ summary: 'Create workflow run', body: CreateWorkflowRunDto.schema })
  @Post('/workflow-runs')
  async createWorkflowRun(@GetToken() token: TokenInfo, @Body() body: CreateWorkflowRunDto) {
    return await this.providersService.createWorkflowRun(token.id, body)
  }

  @ApiDoc({ summary: 'Execute workflow run dry-run', body: ExecuteWorkflowRunDto.schema })
  @Post('/workflow-runs/:id/execute')
  async executeWorkflowRun(@GetToken() token: TokenInfo, @Param('id') id: string, @Body() body: ExecuteWorkflowRunDto) {
    return await this.providersService.executeWorkflowRun(token.id, id, body)
  }

  @ApiDoc({ summary: 'Start Grok OAuth device login', body: GrokDeviceLoginStartDto.schema })
  @Post('/grok/oauth/device')
  async startGrokDeviceLogin(@Body() _body: GrokDeviceLoginStartDto) {
    return await this.providersService.startGrokDeviceLogin()
  }

  @ApiDoc({ summary: 'Poll Grok OAuth device login', body: GrokDeviceLoginPollDto.schema })
  @Post('/grok/oauth/device/poll')
  async pollGrokDeviceLogin(@GetToken() token: TokenInfo, @Body() body: GrokDeviceLoginPollDto) {
    return await this.providersService.pollGrokDeviceLogin(token.id, body)
  }

}
