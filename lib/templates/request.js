'use strict';

const semverGte = require('semver/functions/gte');
const slsVersion = require('serverless/package.json').version;

const { isLocal } = require('../utils/is-local');

/* istanbul ignore next */
const rawBody = isLocal()
	? '#set ( $rawBody = $util.escapeJavaScript($input.json(\'$\')).replaceAll("\\\'", "\\\'").replaceAll("\\n", "\\n") )'
	: '#set ( $rawBody = $util.escapeJavaScript($input.body).replaceAll("\\\'", "\\\\\'") )';

module.exports = {
	// Removing a template was implemented in serverless@1.81.0
	'application/x-www-form-urlencoded': /* istanbul ignore next */ semverGte(slsVersion, '1.81.0') ? null : '',
	'application/json': `#set( $context.requestOverride.querystring.page = $input.params("x-janis-page") )
  #set( $context.requestOverride.querystring.pageSize = $input.params("x-janis-page-size") )
  #set( $body = $input.json("$") )
  ${rawBody}

  #define( $loop )
  {
    #foreach($key in $map.keySet())
    "$util.escapeJavaScript($key).replaceAll("\\\\'", "'")": "$util.escapeJavaScript($map.get($key)).replaceAll("\\\\'", "'")"
    #if( $foreach.hasNext ) , #end
    #end
  }
  #end

  {
    "body": $body,
    "rawBody": "$rawBody",
    "method": "$context.httpMethod",
    "principalId": "$context.authorizer.principalId",
    "stage": "$context.stage",

    #set( $map = $input.params().header )
    "headers": $loop,

    #set( $map = $input.params().querystring )
    "query": $loop,

    #set( $map = $input.params().path )
    "path": $loop,

    "identity": {
      "sourceIp": "$context.identity.sourceIp",
      "userAgent": "$context.identity.userAgent"
    },

    "authorizer": {
      "principalId": "$util.escapeJavaScript($context.authorizer.principalId)",
      #if($context.authorizer.integrationLatency)
      "integrationLatency": "$context.authorizer.integrationLatency",
      #end
      "janisAuth": "$util.escapeJavaScript($context.authorizer.janisAuth).replaceAll("\\\\'", "'")"
    },

    #set( $map = $stageVariables )
    "stageVariables": $loop,

    #set( $map = $requestContext )
    "requestContext": $loop,

    "requestPath": "$context.resourcePath"
  }
`
};
