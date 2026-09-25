'use strict';

const assert = require('assert').strict;

const AddInvokeFunctionPermissions = require('../../../lib/plugins/add-invoke-function-permissions');

describe('Plugins', () => {

	describe('Add Invoke Function Permissions', () => {

		const makeServerless = template => ({
			service: {
				provider: {
					compiledCloudFormationTemplate: template
				}
			},
			cli: { log: () => {} }
		});

		const invokeFunctionUrlPermission = {
			Type: 'AWS::Lambda::Permission',
			Properties: {
				FunctionName: { 'Fn::GetAtt': ['MyLambdaFunction', 'Arn'] },
				Action: 'lambda:InvokeFunctionUrl',
				Principal: '*',
				FunctionUrlAuthType: 'NONE'
			}
		};

		it('Should add a twin lambda:InvokeFunction permission scoped to function URL invocation', () => {

			const template = {
				Resources: {
					MyLambdaPermissionFnUrl: { ...invokeFunctionUrlPermission }
				}
			};

			const plugin = new AddInvokeFunctionPermissions(makeServerless(template));
			plugin.hooks['after:aws:package:finalize:mergeCustomProviderResources']();

			assert.deepStrictEqual(template.Resources.MyLambdaPermissionFnUrlInvokeFunction, {
				Type: 'AWS::Lambda::Permission',
				Properties: {
					FunctionName: { 'Fn::GetAtt': ['MyLambdaFunction', 'Arn'] },
					Action: 'lambda:InvokeFunction',
					Principal: '*',
					InvokedViaFunctionUrl: true
				}
			});

			// Original permission must remain untouched
			assert.deepStrictEqual(template.Resources.MyLambdaPermissionFnUrl, invokeFunctionUrlPermission);
		});

		it('Should not modify permissions with a different action', () => {

			const template = {
				Resources: {
					ApiGatewayPermission: {
						Type: 'AWS::Lambda::Permission',
						Properties: { Action: 'lambda:InvokeFunction', Principal: 'apigateway.amazonaws.com' }
					}
				}
			};

			const plugin = new AddInvokeFunctionPermissions(makeServerless(template));
			plugin.hooks['after:aws:package:finalize:mergeCustomProviderResources']();

			assert.deepStrictEqual(Object.keys(template.Resources), ['ApiGatewayPermission']);
		});

		it('Should ignore resources that are not lambda permissions', () => {

			const template = {
				Resources: {
					MyLambdaFunction: { Type: 'AWS::Lambda::Function', Properties: {} }
				}
			};

			const plugin = new AddInvokeFunctionPermissions(makeServerless(template));
			plugin.hooks['after:aws:package:finalize:mergeCustomProviderResources']();

			assert.deepStrictEqual(Object.keys(template.Resources), ['MyLambdaFunction']);
		});

		it('Should be idempotent, not duplicating an already added twin permission', () => {

			const template = {
				Resources: {
					MyLambdaPermissionFnUrl: { ...invokeFunctionUrlPermission },
					MyLambdaPermissionFnUrlInvokeFunction: { existing: true }
				}
			};

			const plugin = new AddInvokeFunctionPermissions(makeServerless(template));
			plugin.hooks['after:aws:package:finalize:mergeCustomProviderResources']();

			assert.deepStrictEqual(template.Resources.MyLambdaPermissionFnUrlInvokeFunction, { existing: true });
		});

		it('Should not fail when the template has no Resources', () => {

			const plugin = new AddInvokeFunctionPermissions(makeServerless({}));

			assert.doesNotThrow(() => plugin.hooks['after:aws:package:finalize:mergeCustomProviderResources']());
		});
	});
});
