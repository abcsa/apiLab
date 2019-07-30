'use strict';

let _ = require('lodash');

const p = require('../package.json');
const DEFAULT_APP_NAME = p.name;
const DEFAULT_APP_TITLE = p.project;
const DEFAULT_APP_DESCRIPTION = p.description;
const DEFAULT_APP_VERSION = p.version;
const DEFAULT_LOG_FILE = 'labs-api-log.txt';

const DEFAULT_HOST = 'localhost';
const DEFAULT_UNSECURE_PORT = 3001;
const DEFAULT_SECURE_PORT = 3009;
const DEFAULT_BASE_URL ='http://' + DEFAULT_HOST + ':' + DEFAULT_UNSECURE_PORT + '';
const DEFAULT_DATABASE_NAME = 'labs';
const DEFAULT_DATABASE_URI = 'mongodb://localhost:27017/labs?authSource=admin';
const DEFAULT_DATABASE_CONFIG = {keepAlive: 10000, connectTimeoutMS: 10000,  socketTimeoutMS: 10000, reconnectTries: 5, reconnectInterval: 1000};
const DEFAULT_DATABASE_TRACE = true;
const DEFAULT_CRIPTO_ALGORITHM = 'aes192';
const DEFAULT_CRIPTO_PASSWORD = 'SargentPeppersLonelyHeartsClubBand';
const DEFAULT_TOKEN_ALGORITHM = 'HS256';
const DEFAULT_TOKEN_PASSWORD = 'GetYerYaYassOut!TheRollingStonesinConcert';
const DEFAULT_AUTHENTICATION_EXPIRATION=  60;


let defaultConfig = {
	environment: 'DEFAULT',
	app: {
		name: DEFAULT_APP_NAME,
		title: DEFAULT_APP_TITLE,
		description: DEFAULT_APP_DESCRIPTION,
		version: DEFAULT_APP_VERSION
	},
	logFile: DEFAULT_LOG_FILE,
	host: DEFAULT_HOST,
	unsecurePort: DEFAULT_UNSECURE_PORT,
	securePort: DEFAULT_SECURE_PORT,
	db: {
		name: DEFAULT_DATABASE_NAME,
		uri: DEFAULT_DATABASE_URI,
		options: DEFAULT_DATABASE_CONFIG,
		trace: DEFAULT_DATABASE_TRACE
	},
	crypto: {
		algorithm: DEFAULT_CRIPTO_ALGORITHM,
		password: DEFAULT_CRIPTO_PASSWORD
	},
	token: {
		algorithm: DEFAULT_TOKEN_ALGORITHM,
		password: DEFAULT_TOKEN_PASSWORD
	},
	url: {
		base: DEFAULT_BASE_URL
	},
	authentication:{
		minutesToExpire: DEFAULT_AUTHENTICATION_EXPIRATION
	},
};


function getConfig (){
	
	let _config;
	
	switch ((process.env.NODE_ENV || '').toLowerCase()){
		
		case 'development':  //all local
			_config = _.merge(defaultConfig , require('./config/development.json'));
			break;
			
		case 'production':  //all on production environment
			_config = _.merge(defaultConfig , require('./config/production.json'));
			break;
		default:
			_config = defaultConfig;
			break;
	}
	
	return _config;
	
}

module.exports = getConfig();
