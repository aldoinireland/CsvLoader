(function (hasher) {
    
    var crypto = require('crypto');
    var algorithm = 'aes-256-ctr';
    var password = 'mihheyuk';
    
    hasher.createSalt = function() {
        var len = 8;
        return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').substring(0, len);
    };
    
    hasher.computeHash = function(source, salt){
        var hmac = crypto.createHmac("sha1", new Buffer(salt, 'utf-8'));
        var hash = hmac.update(source);
        return hash.digest("hex");
    };
    
    hasher.encrypt = function(text){
        var cipher = crypto.createCipher(algorithm , password);
        var crypted = cipher.update(text,'utf8','hex');
        crypted += cipher.final('hex');
        return crypted;
    };
    
    hasher.decrypt = function(text){
        var decipher = crypto.createDecipher(algorithm,password);
        var dec = decipher.update(text,'hex','utf8');
        dec += decipher.final('utf8');
        return dec;
    };
    
})(module.exports);