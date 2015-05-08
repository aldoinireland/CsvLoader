        var processFiles = function(name, next) {

            var files = [];
            var filenames = [];
            var currentFileName = "";
            var newFileName = "";

            var walker = walk.walk('./input/' + name, {
                followLinks: false
            });

            walker.on('file', function(root, stat, next) {
                // Add this file to the list of files
                files.push(root + '/' + stat.name);
                filenames.push(stat.name);
                next();
            });

            walker.on('end', function() {
                if (files.length > 0) {
                    cleanDatabase(name, function(err) {
                        if (!err) {
                            for (var i = 0; i < files.length; i++) {

                                var stream = fs.createReadStream(files[i]);
                                currentFileName = filenames[i];
                                var header = [];

                                csv
                                    .fromStream(stream, {
                                        headers: true
                                    })
                                    .on("data", function(data) {

                                        //create new schema and save data
                                        var entry = new Entry(data);
                                        entry.save(function(err, data) {
                                            if (!err) {};
                                        });

                                        //check if header array is empty amd if so populate it
                                        if (header.length == 0) {
                                            for (var name in data) {
                                                header.push(name);
                                            }
                                        }

                                    })
                                    .on("end", function() {

                                        uploadModel.findOne({}, {}, {
                                            sort: {
                                                'created_at': -1
                                            }
                                        }, function(err, post) {
                                            if (!err) {

                                                var diff = require('deep-diff').diff;

                                                if (post) {
                                                    var oldHeaders = post._doc.headers;
                                                }
                                                else {
                                                    oldHeaders = [];
                                                }


                                                var differences = diff(oldHeaders, header);

                                                var oldFilename = currentFileName;
                                                var newFilename = hasher.createSalt() + '.' + oldFilename.split('.').pop();

                                                var upload = new uploadModel();
                                                upload.filename = newFilename;
                                                upload.originalname = oldFilename;
                                                upload.headers = header;
                                                upload.logdate = new Date();
                                                upload.folder = "input";
                                                upload.changes = differences;

                                                upload.save(function(err, result) {
                                                    if (!err) {
                                                        var filetoZip = result.filename;
                                                        newFileName = result.filename;
                                                        fs.rename("./input/" + name + "/" + currentFileName, "./archive/" + name + "/" + result.filename, function(err, result) {
                                                            if (!err) {
                                                                var zip = new admzip();
                                                                zip.addLocalFile("./archive/" + name + "/" + filetoZip);
                                                                zip.writeZip("./archive/" + name + "/" + newFileName + ".zip", function(err, result) {
                                                                    if (!err) {
                                                                        fs.unlink("./archive/" + name + "/" + newFileName, function(err) {
                                                                            if (err) throw err;
                                                                            completed.push("1");
                                                                            next();
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                            else {
                                                                console.log(err);
                                                            }
                                                        });
                                                    }
                                                    else {
                                                        console.log("error saving");
                                                    }
                                                });
                                            }
                                            else {
                                                console.log("error");
                                            }
                                        });
                                    });

                            }
                        }
                        else {
                            console.log("error cleaning database");
                        }
                    });
                }
                else {
                    completed.push("1");
                    next();
                }

            });
        }

        var inputs = [];
        var checkForExit = function() {
            if (completed.length == inputs.length) {
            //    process.exit(0);
            console.log("done");
            }
        };

        var inputstream = fs.createReadStream('./settings/inputs.txt');

        var createDirectories = function(callback) {
            for (var i = 0; i < inputs.length; i++) {
                var directory = "./input/" + inputs[i].INPUT;
                var archivedir = "./archive/" + inputs[i].INPUT;
                mkdirp(directory, function(err) {
                    if (!err) {
                        mkdirp(archivedir, function(err) {
                            if (!err) {
                                callback();
                            }
                        });
                    }
                });
            }
        };

        csv
            .fromStream(inputstream, {
                headers: true
            })
            .on("data", function(data) {
                inputs.push(data);
            })
            .on("end", function() {
                createDirectories(function(res) {
                    for (var i = 0; i < inputs.length; i++) {
                        var process = inputs[i].INPUT.toString();
                        processFiles(process, function(res) {
                            checkForExit();
                        });
                    }
                });
            });
    }
    else {
        console.log("error");
    }