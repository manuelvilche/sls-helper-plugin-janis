'use strict';

const { inspect } = require('util');

const { AccountsIdsByService } = require('@janiscommerce/accounts-ids-by-service');

const { kebabCase, titleCase } = require('../utils/string');

const { LOG_FORMAT, LOG_REST_API_CONFIG } = require('../utils/api-gateway-logs-defaults');
const { shouldAddTraceLayer, getTraceLayerArn } = require('../utils/trace-layer');
const { shouldAddVPCConfig, getVPCConfig } = require('../utils/vpc');
const { defaultTags } = require('../utils/default-tags');
const defaultEnvVars = require('../utils/default-env-vars');

const defaultInclude = [
	'src/config/*',
	'node_modules/@babel/runtime/**'
];

const defaultExclude = [
	'.nyc_output/**',
	'.bitbucket/**',
	'.deploy/**',
	'.husky/**',
	'view-schemas/**',
	'view-schemas-built/**',
	'view-schemas-built-local/**',
	'tests/**',
	'test-reports/**',
	'docs/**',
	'hooks/**',
	'events/**',
	'permissions/**',
	'schemas/src/**',
	'serverless/**',
	'src/environments/**',
	'*',
	'.*',
	'node_modules/.cache/**',
	'node_modules/**/README.md',
	'node_modules/**/.github/**',
	'node_modules/**/CHANGELOG.md',
	'node_modules/**/LICENSE',
	'node_modules/**/*.js.map',
	'node_modules/**/*.map',
	'node_modules/**/*.min.map',
	'node_modules/**/*.js.flow',
	'node_modules/**/*.d.ts',
	'node_modules/**/yarn.lock',
	'node_modules/function.prototype.name/**',
	'node_modules/is-typed-array/**',
	'node_modules/mongodb/src/**',
	'node_modules/bson/dist/**',
	'node_modules/bson/src/**',
	'node_modules/@aws-sdk/**',
	'node_modules/**/@aws-sdk/**',
	'node_modules/sinon/**',
	'node_modules/serverless/**',
	'node_modules/@serverless/**',
	'node_modules/@babel/**',
	'node_modules/eslint-plugin-import/**',
	'node_modules/@sinonjs/**',
	'node_modules/faker/dist/**',
	'node_modules/date-fns/esm/**',
	'node_modules/date-fns/fp/**',
	'node_modules/**/date-fns/docs/**',
	'node_modules/**/buffer/test/**',
	'node_modules/**/jmespath/test/**',
	'node_modules/**/qs/test/**',
	'node_modules/**/qs/dist/**',
	'node_modules/**/bson/browser_build/**',
	'node_modules/**/axios/dist/browser/**',
	'node_modules/**/axios/dist/esm/**'
];

const defaultPlugins = [
	'serverless-domain-manager',
	'serverless-offline',
	'serverless-api-gateway-caching',
	'serverless-plugin-stage-variables',
	'@janiscommerce/serverless-plugin-remove-authorizer-permissions',
	'serverless-plugin-split-stacks',
	'./node_modules/sls-helper-plugin-janis/lib/plugins/add-invoke-function-permissions'
];

const gatewayResponseTemplate = `
	{"message":$context.error.messageString,"detail":"$context.authorizer.errorMessage","authorizerErrorType":"$context.error.responseType"}
`.trim();

module.exports = async ({
	provider,
	custom,
	package: slsPackage,
	params,
	plugins,
	pluginsOnly,
	...serviceConfig
}, { serviceCode, servicePort }) => {

	if(!serviceCode || typeof serviceCode !== 'string')
		throw new Error(`Missing or invalid serviceCode in janis.base hook: ${inspect(serviceCode)}`);

	if(serviceCode !== kebabCase(serviceCode))
		throw new Error(`Invalid serviceCode in janis.base hook. It must be in dash-case. Received ${serviceCode}. Recommended: ${kebabCase(serviceCode)}`);

	if(!servicePort || typeof servicePort !== 'number')
		throw new Error(`Missing or invalid servicePort in janis.base hook: ${inspect(servicePort)}`);

	const awsAccountsByService = await AccountsIdsByService.getMapping();

	const serviceTitle = titleCase(serviceCode);
	const serviceName = serviceTitle.replace(/ /g, '');

	const {
		include,
		includeOnly,
		exclude,
		excludeOnly,
		...restOfPackage
	} = slsPackage || {};

	const finalExclude = excludeOnly || [
		...defaultExclude,
		...(exclude || [])
	];

	const finalInclude = includeOnly || [
		...defaultInclude,
		...(include || [])
	];

	const finalPlugins = pluginsOnly || [
		...defaultPlugins,
		...(plugins || [])
	];

	const traceLayerArn = getTraceLayerArn();

	const layers = [
		...provider?.layers || [],
		...traceLayerArn ? [traceLayerArn] : []
	];

	const serviceTags = defaultTags.reduce((accum, tag) => {
		accum[tag.Key] = tag.Value;
		return accum;
	}, {});

	return {
		service: 'Janis${self:custom.serviceName}Service',
		provider: {
			name: 'aws',
			runtime: 'nodejs22.x',
			memorySize: 1024,
			stage: '${opt:stage, \'local\'}',
			region: '${opt:region, \'us-east-1\'}',
			role: 'ServiceExecutionRole',
			endpointType: 'REGIONAL',
			apiName: 'JANIS ${param:humanReadableStage} ${self:custom.serviceTitle} API',
			logRetentionInDays: 60,
			environment: {
				...defaultEnvVars,
				...shouldAddTraceLayer() && { JANIS_TRACE_EXTENSION_ENABLED: 'true' }
			},
			tags: serviceTags,
			stackTags: serviceTags,
			deploymentMethod: 'direct',
			deploymentBucket: {
				tags: serviceTags
			},
			versionFunctions: false,
			apiGateway: {
				disableDefaultEndpoint: true,
				minimumCompressionSize: 1024
			},
			logs: {
				restApi: {
					role: { 'Fn::GetAtt': ['serverlessApiGatewayCloudWatchRole', 'Arn'] },
					...LOG_REST_API_CONFIG,
					format: JSON.stringify(LOG_FORMAT)
				}
			},
			...layers.length ? { layers } : {},
			...shouldAddVPCConfig() && { vpc: getVPCConfig() },
			...(provider || {})
		},
		params: {
			// To allow other stages, for example default
			...params,
			local: {
				humanReadableStage: 'Local',
				janisDomain: 'janis.localhost',
				...params?.local
			},
			beta: {
				humanReadableStage: 'Beta',
				janisDomain: 'janisdev.in',
				...params?.beta
			},
			qa: {
				humanReadableStage: 'QA',
				janisDomain: 'janisqa.in',
				...params?.qa
			},
			prod: {
				humanReadableStage: 'Prod',
				janisDomain: 'janis.in',
				...params?.prod
			}
		},
		package: {
			individually: false,
			include: finalInclude,
			exclude: finalExclude,
			...restOfPackage
		},
		custom: {
			serviceTitle,
			serviceName,
			serviceCode,
			stage: '${self:provider.stage}',
			region: '${self:provider.region}',
			awsAccountsByService,

			// Deprecated, use ${param:humanReadableStage} instead
			humanReadableStage: {
				local: 'Local',
				beta: 'Beta',
				qa: 'QA',
				prod: 'Prod'
			},

			'serverless-offline': {
				httpPort: servicePort,
				lambdaPort: Number(`2${servicePort}`),
				host: '0.0.0.0',
				stage: 'local',
				noPrependStageInUrl: true,
				prefix: 'api',
				reloadHandler: true
			},

			// Deprecated, use ${param:janisDomain} instead
			janisDomains: {
				local: 'janis.localhost',
				beta: 'janisdev.in',
				qa: 'janisqa.in',
				prod: 'janis.in'
			},

			customDomain: {
				domainName: '${self:custom.serviceCode}.${param:janisDomain}',
				basePath: 'api',
				stage: '${self:custom.stage}',
				createRoute53Record: true,
				endpointType: 'regional',
				securityPolicy: 'tls_1_2'
			},

			cacheEnabled: {
				prod: false
			},

			apiGatewayCaching: {
				enabled: '${self:custom.cacheEnabled.${self:custom.stage}, \'false\'}',
				clusterSize: '0.5',
				ttlInSeconds: 600 // 10 minutos
			},

			stageVariables: {
				serviceName: '${self:custom.serviceCode}'
			},

			reducer: {
				ignoreMissing: true
			},

			...(custom || {})
		},
		plugins: finalPlugins,
		resources: {
			Resources: {

				ServiceExecutionRole: {
					Type: 'AWS::IAM::Role',
					Properties: {
						RoleName: 'Janis${self:custom.serviceName}Service-${self:custom.stage}-lambdaRole',
						Path: '/janis-service/',
						AssumeRolePolicyDocument: {
							Version: '2012-10-17',
							Statement: [
								{
									Effect: 'Allow',
									Principal: {
										Service: [
											'lambda.amazonaws.com'
										]
									},
									Action: 'sts:AssumeRole'
								}
							]
						},
						ManagedPolicyArns: [
							'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
							'arn:aws:iam::${aws:accountId}:policy/JanisLambdaBasePolicy${param:humanReadableStage}'
						],
						Policies: [
							{
								PolicyName: 'janis-${self:custom.serviceCode}-logs-policy',
								PolicyDocument: {
									Version: '2012-10-17',
									Statement: [
										{
											Effect: 'Allow',
											Action: [
												'logs:CreateLogGroup',
												'logs:CreateLogStream',
												'logs:PutLogEvents'
											],
											Resource: [
												{
													'Fn::Join': [
														':',
														[
															'arn:aws:logs',
															{ Ref: 'AWS::Region' },
															{ Ref: 'AWS::AccountId' },
															'log-group:/aws/lambda/*:*'
														]
													]
												},
												{
													'Fn::Join': [
														':',
														[
															'arn:aws:logs',
															{ Ref: 'AWS::Region' },
															{ Ref: 'AWS::AccountId' },
															'log-group:/aws/lambda/*:*:*'
														]
													]
												}
											]
										}
									]
								}
							},
							{
								PolicyName: 'janis-${self:custom.serviceCode}-get-databases-parameter-store',
								PolicyDocument: {
									Version: '2012-10-17',
									Statement: [
										{
											Effect: 'Allow',
											Action: 'ssm:GetParameter',
											Resource: [
												{
													'Fn::Join': [
														':',
														[
															'arn:aws:ssm',
															{ Ref: 'AWS::Region' },
															{ Ref: 'AWS::AccountId' },
															'parameter/${self:custom.serviceCode}-databases'
														]
													]
												}
											]
										}
									]
								}
							}
						]
					}
				},

				BadRequestDefault: {
					Type: 'AWS::ApiGateway::GatewayResponse',
					Properties: {
						ResponseParameters: {
							'gatewayresponse.header.Access-Control-Allow-Origin': 'method.request.header.Origin'
						},
						ResponseTemplates: {
							'application/json': gatewayResponseTemplate
						},
						ResponseType: 'DEFAULT_4XX',
						RestApiId: {
							Ref: 'ApiGatewayRestApi'
						},
						StatusCode: '400'
					}
				},

				UnauthorizedResponse: {
					Type: 'AWS::ApiGateway::GatewayResponse',
					Properties: {
						ResponseParameters: {
							'gatewayresponse.header.Access-Control-Allow-Origin': 'method.request.header.Origin'
						},
						ResponseTemplates: {
							'application/json': gatewayResponseTemplate
						},
						ResponseType: 'UNAUTHORIZED',
						RestApiId: {
							Ref: 'ApiGatewayRestApi'
						},
						StatusCode: '401'
					}
				},

				AccessDeniedResponse: {
					Type: 'AWS::ApiGateway::GatewayResponse',
					Properties: {
						ResponseParameters: {
							'gatewayresponse.header.Access-Control-Allow-Origin': 'method.request.header.Origin'
						},
						ResponseTemplates: {
							'application/json': gatewayResponseTemplate
						},
						ResponseType: 'ACCESS_DENIED',
						RestApiId: {
							Ref: 'ApiGatewayRestApi'
						},
						StatusCode: '403'
					}
				},

				ServerErrorDefault: {
					Type: 'AWS::ApiGateway::GatewayResponse',
					Properties: {
						ResponseParameters: {
							'gatewayresponse.header.Access-Control-Allow-Origin': 'method.request.header.Origin'
						},
						ResponseTemplates: {
							'application/json': gatewayResponseTemplate
						},
						ResponseType: 'DEFAULT_5XX',
						RestApiId: {
							Ref: 'ApiGatewayRestApi'
						},
						StatusCode: '500'
					}
				},

				IntegrationTimeoutResponse: {
					Type: 'AWS::ApiGateway::GatewayResponse',
					Properties: {
						ResponseParameters: {
							'gatewayresponse.header.Access-Control-Allow-Origin': 'method.request.header.Origin'
						},
						ResponseTemplates: {
							'application/json': '{"message":"Timeout","authorizerErrorType":"$context.error.responseType"}'
						},
						ResponseType: 'INTEGRATION_TIMEOUT',
						RestApiId: {
							Ref: 'ApiGatewayRestApi'
						},
						StatusCode: '504'
					}
				},

				serverlessApiGatewayCloudWatchRole: {
					Type: 'AWS::IAM::Role',
					Properties: {
						AssumeRolePolicyDocument: {
							Version: '2012-10-17',
							Statement: [{
								Effect: 'Allow',
								Principal: {
									Service: ['apigateway.amazonaws.com']
								},
								Action: 'sts:AssumeRole'
							}]
						},
						ManagedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs']
					}
				}
			},

			extensions: {
				CustomDashresourceDashapigwDashcwDashroleLambdaFunction: {
					Properties: {
						Runtime: 'nodejs22.x'
					}
				}
			}
		},
		...serviceConfig
	};
};
