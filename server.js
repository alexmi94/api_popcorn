/* Import */

require('dotenv').config(); // https://www.npmjs.com/package/dotenv
const express = require('express'); // https://www.npmjs.com/package/express
const mysql = require('mysql'); // https://www.npmjs.com/package/mysql
const path = require('path'); // https://www.npmjs.com/package/path
const { v4: uuidv4 } = require('uuid'); // https://www.npmjs.com/package/uuid
const bcrypt = require('bcryptjs'); //=> https://www.npmjs.com/package/bcryptjs
const CryptoJS = require("crypto-js"); //=> https://www.npmjs.com/package/crypto-js
const cookieParser = require('cookie-parser'); //=> https://www.npmjs.com/package/cookie-parser
const jwt = require('jsonwebtoken'); //=> https://www.npmjs.com/package/jsonwebtoken

/* Server classe */



class ServerClass {
    // Inject value into the classe
    constructor(){
        // Set server properties
        this.app = express();
        this.port = process.env.PORT;

        // Define server
        this.server = require('http').Server(this.app)

        // Define MYSQL connection
        this.connection = mysql.createConnection({
            host: process.env.DB_URL,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            //password: process.env.DB_PWD,
            database: process.env.DB_NAME
        })
    }
    verifytoken(req, callback){
        const cookies = req.cookies["popcorn-token"]
        let token;
        let decoded;
        try{
            token = CryptoJS.AES.decrypt(cookies, process.env.SERVER_CRYPTO_SECRET).toString(CryptoJS.enc.Utf8);
        }catch(err){
            return callback(false);
        }
        decoded = jwt.verify(token, process.env.SERVER_JWT_SECRET);    
        this.connection.query(`
            SELECT * FROM user WHERE id = ${decoded.id}
        `, 
        (mysqlError, results) => {
            if( mysqlError ){
                return callback(false);
            }
            else{
                if(decoded.email == results[0].email){
                    if(decoded.password == results[0].password){
                        return callback(true);
                    }
                    return callback(false);
                }
                return callback(false);
                
            }
            
        });
    }

    // Method to initiate server
    init(){
        // Set static folder
        this.app.set( 'views', __dirname + '/www' );
        this.app.use( express.static( path.join(__dirname, 'www') ) );

        // Set view engine
        this.app.set('view engine', 'ejs');

        // Set body request
        this.app.use( express.json({ limit: '20mb' }) );
        this.app.use( express.urlencoded({ extended: true }) );

        this.app.use(cookieParser());

        // Bind HTTP request
        this.bindRoutes();
    }

    // Method to define serveur routes
    bindRoutes(){

    //############################################################
    //# +------------------------------------------------------+ #
    //# |                       Token                          | #
    //# +------------------------------------------------------+ #
    //############################################################

    this.app.get('/api/get_token', async ( req, res ) => {
        // Get token

            this.connection.query(`
            SELECT * FROM user WHERE user.email = "${req.body.email}"
        `, 
        (mysqlError, results) => {
            if( mysqlError ){
                return res.status(502).json({ 
                    msg: 'Bad Gateway ou Proxy Error: MySQL',
                    error: mysqlError,
                    data: null,
                })
            }
            else{

                //verify email

                if(results.length == 0){
                    return res.status(403).json({ 
                        msg: 'Forbidden',
                        error: null,
                        data: results,
                    })
                }

                //verify password

                const validatedPassword = bcrypt.compareSync( 
                    req.body.password, 
                    results[0].password,
                );

                if(validatedPassword){
                    //generate token
                    let userToken = jwt.sign(
                        { 
                            id: results[0].id,
                            email: results[0].email,
                            password: results[0].password
                        }, 
                        process.env.SERVER_JWT_SECRET
                    );
                    
                    userToken = CryptoJS.AES.encrypt( userToken, process.env.SERVER_CRYPTO_SECRET ).toString();

                    res.cookie('popcorn-token', userToken, { maxAge: 700000, httpOnly: true });

                    return res.status(200).json({ 
                        msg: 'OK',
                        error: null,
                        data: userToken,
                    })
                }else{
                    return res.status(403).json({ 
                        msg: 'Forbidden',
                        error: null,
                        data: results,
                    })
                }

            }
        });
    })

    //############################################################
    //# +------------------------------------------------------+ #
    //# |                        User                          | #
    //# +------------------------------------------------------+ #
    //############################################################

        this.app.get('/api/user/:id', ( req, res ) => {
            // Get user with id
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`
                    SELECT * FROM user WHERE id = ${req.params.id}
                    `, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            //Decrypt alternate_name and address
                            results[0].alternate_name = CryptoJS.AES.decrypt(results[0].alternate_name, process.env.SERVER_CRYPTO_SECRET).toString(CryptoJS.enc.Utf8);
                            results[0].address = CryptoJS.AES.decrypt(results[0].address, process.env.SERVER_CRYPTO_SECRET).toString(CryptoJS.enc.Utf8);
                            
                            return res.status(200).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }
            })                
        })

        this.app.get('/api/user/:id/bookmark', ( req, res ) => {
            // Get the movie that the user has bookmarked with the id
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`
                        SELECT movie.* FROM bookmark, movie, user WHERE user.id = bookmark.id_user AND user.id = ${req.params.id} ORDER BY movie.headline
                    `, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(200).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }
            })
        })
        
        this.app.post('/api/user', async ( req, res ) => {
            // Create user

            req.body.alternate_name = CryptoJS.AES.encrypt(req.body.alternate_name, process.env.SERVER_CRYPTO_SECRET ).toString();
            req.body.address = CryptoJS.AES.encrypt(req.body.address, process.env.SERVER_CRYPTO_SECRET ).toString();

            req.body.password = await bcrypt.hash(req.body.password, parseInt(process.env.SERVER_HASH));

            this.connection.query(`
                INSERT INTO user (uuid, alternate_name, email, password, address) VALUES ('${uuidv4()}', '${req.body.alternate_name}', '${req.body.email}', '${req.body.password}', '${req.body.address}')
            `, 
            (mysqlError, results) => {
                if( mysqlError ){
                    return res.status(502).json({ 
                        msg: 'Bad Gateway ou Proxy Error: MySQL',
                        error: mysqlError,
                        data: null,
                    })
                }
                else{
                    return res.status(201).json({ 
                        msg: 'OK',
                        error: null,
                        data: results,
                    })
                }
            });

        })

        this.app.put('/api/user/:id/alternate_name', ( req, res ) => {
            // Edit alternate_name of user
            this.verifytoken(req, (result) =>{
                if(result){
                    req.body.alternate_name = CryptoJS.AES.encrypt(req.body.alternate_name, process.env.SERVER_CRYPTO_SECRET).toString();

                    this.connection.query(`UPDATE user SET alternate_name = "${req.body.alternate_name}" WHERE id = ${req.params.id}`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(202).json({ 
                                msg: 'Accepted',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})


        })

        this.app.put('/api/user/:id/email', ( req, res ) => {
            // Edit email of user
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE user SET email = "${req.body.email}" WHERE id = ${req.params.id}`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(202).json({ 
                                msg: 'Accepted',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})


        })

        this.app.put('/api/user/:id/password', async ( req, res ) => {
            // Edit password of user

            this.verifytoken(req, async (result) =>{
                if(result){
                req.body.password = await bcrypt.hash(req.body.password, process.env.SERVER_HASH);

                this.connection.query(`UPDATE user SET password = "${req.body.password}" WHERE id = ${req.params.id}`, 
                (mysqlError, results) => {
                    if( mysqlError ){
                        return res.status(502).json({ 
                            msg: 'Bad Gateway ou Proxy Error: MySQL',
                            error: mysqlError,
                            data: null,
                        })
                    }
                    else{
                        return res.status(202).json({ 
                            msg: 'Accepted',
                            error: null,
                            data: results,
                        })
                    }
                });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})


        })


        this.app.put('/api/user/:id/address', async ( req, res ) => {
            // Edit address of user

            this.verifytoken(req, (result) =>{
                if(result){
                    req.body.address = CryptoJS.AES.encrypt(req.body.alternate_name, process.env.SERVER_CRYPTO_SECRET).toString();
                    this.connection.query(`UPDATE user SET address = "${req.body.address}" WHERE id = ${req.params.id}`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(202).json({ 
                                msg: 'Accepted',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })
        

        this.app.delete('/api/user/:id', ( req, res ) => {
            // Delete user
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`DELETE FROM user WHERE id = "${req.params.id}"`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(202).json({ 
                                msg: 'Accepted',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})

        })


    //############################################################
    //# +------------------------------------------------------+ #
    //# |                      bookmark                        | #
    //# +------------------------------------------------------+ #
    //############################################################

        this.app.post('/api/bookmark', async ( req, res ) => {
            // Add bookmark
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`INSERT INTO bookmark (uuid, id_user, id_movie) VALUES ("${uuidv4()}", "${req.body.id_user}", "${req.body.id_movie}")`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            if(mysqlError.errno == 1452){
                                //Foreign key constraint
                                return res.status(400).json({ 
                                    msg: 'Bad Request',
                                    error: mysqlError,
                                    data: null,
                                })

                            }else{
                                return res.status(502).json({ 
                                    msg: 'Bad Gateway ou Proxy Error: MySQL',
                                    error: mysqlError,
                                    data: null,
                                })
                            }

                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.delete('/api/bookmark', async ( req, res ) => {
            // Delete bookmark
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`DELETE FROM bookmark WHERE id_user = "${req.body.id_user}" AND id_movie = "${req.body.id_movie}"`, 
                    (mysqlError, results) => {
                    if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })

                    }
                    else{
                        return res.status(202).json({ 
                            msg: 'Accepted',
                            error: null,
                            data: results,
                        })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
            

        })
    

        //############################################################
        //# +------------------------------------------------------+ #
        //# |                       Movie                          | #
        //# +------------------------------------------------------+ #
        //############################################################


        this.app.get('/api/movie/:id', ( req, res ) => {

            this.verifytoken(req, (result) =>{
                // Get movie with id
                if(result){
                    this.connection.query(`
                    SELECT * FROM movie WHERE id = ${req.params.id}
                    `, 
                    (mysqlError, results) => {
                    if( mysqlError ){
                        return res.status(502).json({ 
                            msg: 'Bad Gateway ou Proxy Error: MySQL',
                            error: mysqlError,
                            data: null,
                        })
                    }
                    else{
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: results,
                        })
                    }
                });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})


        })

        this.app.post('/api/movie', async ( req, res ) => {
            // Add movie

            this.verifytoken(req, (result) =>{
                if(result){

                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})

            this.connection.query(`INSERT INTO movie (uuid, headline, image, abstract, same_as, genre, duration, date_published) VALUES ("${uuidv4()}", "${req.body.headline}", "${req.body.image}", "${req.body.abstract}", "${req.body.same_as}", "${req.body.genre}", "${req.body.duration}", "${req.body.date_published}")`, 
            (mysqlError, results) => {
                if( mysqlError ){
                    return res.status(502).json({ 
                        msg: 'Bad Gateway ou Proxy Error: MySQL',
                        error: mysqlError,
                        data: null,
                    })
                }
                else{
                    return res.status(201).json({ 
                        msg: 'OK',
                        error: null,
                        data: results,
                    })
                }
            });

        })

        this.app.get('/api/movie/search/headline', ( req, res ) => {
            // Get (search) movie with headline
            this.verifytoken(req, (result) =>{
                if(result){  
                this.connection.query(`
                SELECT * FROM movie WHERE headline LIKE "${req.body.headline}%"
                `, 
                (mysqlError, results) => {
                    if( mysqlError ){
                        return res.status(502).json({ 
                            msg: 'Bad Gateway ou Proxy Error: MySQL',
                            error: mysqlError,
                            data: null,
                        })
                    }
                    else{
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: results,
                        })
                    }
                });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})


        })

        this.app.get('/api/movie/search/genre', ( req, res ) => {
            // Get (search) movie with headline
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`
                    SELECT * FROM movie WHERE genre LIKE "%${req.body.genre}%"
                    `, 
                    (mysqlError, results) => {
                    if( mysqlError ){
                        return res.status(502).json({ 
                            msg: 'Bad Gateway ou Proxy Error: MySQL',
                            error: mysqlError,
                            data: null,
                        })
                    }
                    else{
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: results,
                        })
                    }
                });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })


        this.app.put('/api/movie/:id/headline',( req, res ) => {
            // Edit headline movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET headline = "${req.body.headline}" WHERE id = ${req.params.id}`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/image',( req, res ) => {
            // Edit image movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET image = "${req.body.image}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/abstract',( req, res ) => {
            // Edit abstract movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET abstract = "${req.body.abstract}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/same_as',( req, res ) => {
            // Edit same_as movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET same_as = "${req.body.same_as}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/genre',( req, res ) => {
            // Edit genre movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET genre = "${req.body.genre}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/duration',( req, res ) => {
            // Edit duration movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET duration = "${req.body.duration}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.put('/api/movie/:id/date_published',( req, res ) => {
            // Edit date_published movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`UPDATE movie SET date_published = "${req.body.date_published}" WHERE id = ${req.params.id}`,
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(201).json({ 
                                msg: 'OK',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.delete('/api/movie/:id', async ( req, res ) => {
            // Delete movie
            this.verifytoken(req, (result) =>{
                if(result){
                    this.connection.query(`DELETE FROM movie WHERE id = "${req.params.id}"`, 
                    (mysqlError, results) => {
                        if( mysqlError ){
                            return res.status(502).json({ 
                                msg: 'Bad Gateway ou Proxy Error: MySQL',
                                error: mysqlError,
                                data: null,
                            })
                        }
                        else{
                            return res.status(202).json({ 
                                msg: 'Accepted',
                                error: null,
                                data: results,
                            })
                        }
                    });
                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.launch();
    };
    // Method to start server
    launch(){
        // Connect API the the DDB server

        console.log(process.env.DB_PWD);

        this.connection.connect( (err) => {
            // Check error
            if(err){ console.log('DDB error', err) }
            else{
                this.server.listen( this.port, () => {
                    // Debug
                    console.log({
                        node: `http://localhost:${this.port}`,
                        db: this.connection.threadId,
                    })
                })
            }
        })
    }
}
//

/* 
Start server
*/
const iticServer = new ServerClass();
iticServer.init();
//