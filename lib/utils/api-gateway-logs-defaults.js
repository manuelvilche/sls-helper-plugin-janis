'use strict';

// Variables documentation: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-variables-for-access-logging.html

module.exports.LOG_FORMAT = {
	date: '$context.requestTime',
	reqId: '$context.requestId',
	integReqId: '$context.integration.requestId',
	accountId: '$context.accountId',
	stage: '$context.stage',
	ip: '$context.identity.sourceIp',
	ua: '$context.identity.userAgent',
	reqMethod: '$context.httpMethod',
	path: '$context.resourcePath',
	realPath: '$context.path',
	status: '$context.status',
	authTime: '$context.authorizer.latency',
	authStatus: '$context.authorizer.status',
	authReqId: '$context.authorizer.requestId',
	// Start of Authorizer custom context
	clientCode: '$context.authorizer.clientCode',
	principalId: '$context.authorizer.principalId',
	sessionId: '$context.authorizer.sessionId',
	appClientId: '$context.authorizer.appClientId',
	authName: '$context.authorizer.authName',
	authMethod: '$context.authorizer.authMethod',
	apiKey: '$context.authorizer.janisApiKey',
	// End of Authorizer custom context
	resTime: '$context.responseLatency',
	gwError: '$context.error.message',
	integError: '$context.integration.error',
	integStatus: '$context.integrationStatus',
	integLatency: '$context.integrationLatency',
	traceId: '$context.xrayTraceId',
	wafCode: '$context.wafResponseCode',
	// Pagination headers, copied to requestOverride by the request template (see lib/templates/request.js)
	// Access logs can't read request headers and don't resolve variable names with dashes
	page: '$context.requestOverride.querystring.page',
	pageSize: '$context.requestOverride.querystring.pageSize'
};

module.exports.LOG_REST_API_CONFIG = {
	accessLogging: true,
	executionLogging: false,
	level: 'INFO',
	fullExecutionData: false
};
