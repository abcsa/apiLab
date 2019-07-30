'use strict';

let helper = require('../common/helper.js');
let db = require('../common/db.js');
let config = require('../common/config.js');
let messager = require('../common/messenger.js');
let _ = require('lodash');

let currentModule = 'authorizationController.js';
let tokenCollection = 'tokens';
let userCollection = 'users';
let paramId = 'passwordResetToken';

exports.getToken = function (req, res, next){
	
	let tokenId;
	let payload;
 
	let token = req.params[paramId];
	
	return helper.decodeJWT(token)
		.then(function (result){
			payload = result;
			tokenId = payload.jti;
			
			return db.collection('tokens').find({jti: payload.jti});
		})
		.then(function (result){
			if (!result || !result[0]) {
				return Promise.reject('Token não encontrado!');
			}
			
			if(result[0].exp < Math.floor(new Date() / 1000)){
				return Promise.reject('O Token está expirado!');
			}
			
			if(result[0].isUsed === true){
				return Promise.reject('O Token já foi usado anteriormente!');
			}
			
			if(result[0].isReplaced === true){
				return Promise.reject('O Token foi substituido e não está mais ativo!');
			}
			
			_.set(req, 'resources.token', token);
			_.set(req, 'resources.payload', payload);
			return next();

		})
		.catch(function (ex){
			if (req && req.resources){
				delete req.resources.token;
			}
			return next(helper.REST.unauthorized(currentModule, 'getToken', ex));
		});

};

exports.validate = function (req, res, next){
 
	let [user, password] = helper.getBasicCredentials(req.headers.authorization);
	
	if(!user || !password){
		return next(helper.REST.badRequest(currentModule, 'validate', 'User and password are required'));
	}
	
	helper.Log(req, currentModule, 'validate', 'Validating user "' + user + '" and password...');
	return db.collection('users').find({user: user, password: password, isDeleted: {$ne: true}})
		.then(function (result){
			
			if (!result || !result[0]) {
				return Promise.reject('Wrong user or password');
			}

			return helper.audit(req, helper.EVENTS.users.validate, result[0])
				.then(function (){
					return res.send(helper.REST.ok({status: 'ok'}));
				});
		})
		.catch(function (ex){
			return next(helper.REST.unauthorized(currentModule, 'validate', ex));
		});
	
};

exports.authenticate = function (req, res, next){

	let [login, password] = helper.getBasicCredentials(req.headers.authorization);


	if(!login || !password){
		return next(helper.REST.badRequest(currentModule, 'authenticate', 'User and password are required'));
	}
	if(helper.isEmail(login)){
		return next(helper.REST.badRequest(currentModule, 'authenticate', 'Login should be a code not an email address'));
	}
	
	let code = helper.getCodeFromLogin(login, false);

	let payload;
	let token;
	let userData;
 
	return db.collection('users').find({user: code, password: password, isDeleted: {$ne: true}})
		.then(function (result){
			
			if (!result || !result[0]) {
				return Promise.reject('Wrong user or password');
			}
			
			userData = result[0];

			payload = helper.createJWTPayload('access', login,'' , userData.tokenExpiration);
			token = helper.encodeJWT(payload);
			
			let data = payload;
			data._id = payload.jti;
			
			return db.collection(tokenCollection).update({jti: payload.jti}, payload, {multi: false, upsert: true});
			
		})
		.then(function () {
			return db.collection('users').update({user: code}, {$set: {lastLoginAt: helper.getCurrentDateString()}}, {multi: false, upsert: false});
		})
		.then(function () {
			_.set(req, 'resources.token', token);
			_.set(req, 'resources.payload', payload);
			return helper.audit(req, helper.EVENTS.users.authenticate, payload);
		})
		.then(function () {
			return next();
		})
		.catch(function (ex){
			return next(helper.REST.unauthorized(currentModule, 'authenticate', ex));
		});

};

exports.getAccessToken = function (req, res, next){
	

	let [login, password] = helper.getBasicCredentials(req.headers.authorization);
	
	if(!login || !password){
		return next(helper.REST.badRequest(currentModule, 'getAccessToken', 'User and password are required'));
	}
	
	if (login === 'milk-app' && password === '1230780312d91a9c63c36fe4fec4cf61'){
		return next();
	}else{
		return next(helper.REST.unauthorized(currentModule, 'getAccessToken', 'Client authentication failed'));
	}

};

exports.validateAccessToken = function (req, res, next){
	
	let token = req.headers.token || req.query.token;
	if(!token){
		return next(helper.REST.badRequest(currentModule, 'validateAccessToken', 'An access token is required'));
	}
	
	let payload;

	return helper.decodeJWT(token)
		.then(function (result){
			payload = result;
			return db.collection('tokens').find({jti: payload.jti});
		})
		.then(function (result){
			
			if (!result || result[0]) {
				let code = helper.getCodeFromLogin(payload.aud, false);
				let impersonateCode = helper.getCodeFromLogin(payload.aud, true);
	
				let user;
				
				if(code === payload.aud) {
					user = {
						user: payload.aud
					};
				}else{
					user = {
						user: impersonateCode
					};
				}

				helper.Log(req, currentModule, 'validateAccessToken', 'Access token is from user "' + payload.aud + '"' + (code !== payload.aud ? ' (user "' + code + '" impersonating user "' +  impersonateCode + '")' : '') + '...');
				_.set(req, 'resources.authUser', user);
				_.set(req, 'resources.token', token);
				_.set(req, 'resources.payload', payload);

				return next();
				
			}else{
				return Promise.reject({message: 'Token is invalid!'});
			}
 
		})
		.catch(function (ex) {
			if (req && req.resources){
				delete req.resources.token;
				delete req.resources.authUser;
			}
			return next(helper.REST.unauthorized(currentModule, 'validateAccessToken', ex.message));
		});
	
};
