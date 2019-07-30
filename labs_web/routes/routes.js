'use strict';

let helper = require('../common/helper.js');
let config = require('../common/config.js');

let usersController = require('../controllers/usersController.js');
let auditsController = require('../controllers/auditsController.js');
let authorizationController = require('../controllers/authorizationController.js');


let currentModule = 'routes.js';

let routes = [];

exports.getRoutes = function (){
	
	return routes;
	
};

module.exports = function (app){

	let commonRoute = '';
	
	//----------------------------------------------
	//Audits:
	
	app.route(commonRoute + '/audits')
		.post(authorizationController.validateAccessToken, auditsController.createAudit);

	//----------------------------------------------
	// Authorization:
	
	app.route(commonRoute + '/auth/validate')
		.get(authorizationController.validate);
	
	app.route(commonRoute + '/auth/authenticate')
		.get(authorizationController.authenticate, usersController.getUserData)
		.post(authorizationController.authenticate, usersController.getUserData);
	
	app.route(commonRoute + '/auth/signup')
		.post(authorizationController.signup);

	
	//----------------------------------------------
	// Users:
	
	app.route(commonRoute + '/users')
		.get(authorizationController.validateAccessToken, usersController.listUsers);
	
	app.route(commonRoute + '/users/:userId')
		.get(authorizationController.validateAccessToken, usersController.getUserById, usersController.getUser)
		.put(authorizationController.validateAccessToken,usersController.getUserById,  usersController.updateUser)
		.delete(authorizationController.validateAccessToken, usersController.getUserById, usersController.deleteUser);



	commonRoute = config.url.base;

	//Creates a handy list of routes (with the allowed functions)
	app._router.stack.forEach(function (middleware){
		if (middleware.route) {
			let route = {
				path: commonRoute + middleware.route.path,
				name: middleware.route.path,
				methods: [
					middleware.route.methods.get ?     'GET' : '',
					middleware.route.methods.put ?     'PUT' : '',
					middleware.route.methods.post ?    'POST' : '',
					middleware.route.methods.delete ?  'DEL' : '',
				].filter(function (item){
					return item;
				}).join(', '),
				description: '',
				version: ''
			};
			routes.push(route);
			helper.Log(null, currentModule, 'enumEndPoints', '      "' + route.path + '" (' + route.methods + ')');
		}
	});
	
};
