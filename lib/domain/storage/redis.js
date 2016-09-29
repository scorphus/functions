const Redis = require('ioredis');
const log = require('../../support/log');
const config = require('../../support/config');
const Storage = require('../storage');

class StorageRedis extends Storage {
    constructor(options=null) {
        super();
        if (!options) {
            options = config.redis;
        }

        let params ={
            enableReadyCheck: true,
            dropBufferSupport: true,
            enableOfflineQueue: options.enableOfflineQueue,
            connectTimeout: 1000,
            keyPrefix: options.keyPrefix
        };

        if (options.sentinels) {
            params.sentinels = options.sentinels;
            params.name = options.sentinelName;
            params.password = options.password;

            this._client = new Redis(params);
        } else {
            this._client = new Redis(options.url, params);
        }

        this._client.on('ready', function () {
            log.info('Redis is ready to receive calls.');
        });
        this._client.on('error', function (err) {
            let errorMessage = 'The connection with redis has been lost. Performance issues may happen. Error:' + err;
            log.error(errorMessage);
        });
        this._cache = {};
    }

    ping() {
        return this._client.ping();
    }

    putCode(namespace, id, code) {
        let key = redisKey(namespace, id);
        let data = {
            code: code.code,
            hash: code.hash,
        };
        return this._client.hmset(key, data);
    }

    getCode(namespace, id) {
        let key = redisKey(namespace, id);
        return this._client.hgetall(key).then((data) => {
            if (!data.code) {
                return null;
            }
            return {
                id,
                code: data.code,
                hash: data.hash,
            };
        });
    }

    deleteCode(namespace, id) {
        let key = redisKey(namespace, id);
        return this._client.del(key);
    }

    getCodeByCache(namespace, id, {preCache}) {
        let key = redisKey(namespace, id);
        return this._client.hget(key, 'hash')
            .then((hash) => {
                let cacheItem = this._cache[key];

                if (hash && cacheItem && cacheItem.hash === hash) {
                    return cacheItem;
                }

                //populate the cache
                return getCodeAndPopulateCache(this, namespace, id, preCache);
            });
    }
}

function getCodeAndPopulateCache(storage, namespace, id, preCache) {
    log.info('Get code from database, namespace:', namespace,
             'codeId:', id, 'and store on cache');

    return storage
        .getCode(namespace, id)
        .then((code) => {
            if (!code) {
                return null;
            }

            let cacheItem = preCache(code);
            let key = redisKey(namespace, id);
            storage._cache[key] = cacheItem;
            return cacheItem;
        });
}

function redisKey(namespace, codeId) {
    return `code:${namespace}/${codeId}`;
}

module.exports = StorageRedis