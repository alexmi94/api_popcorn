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
const fetch = require("node-fetch"); // => https://www.npmjs.com/package/node-fetch
const { generateKey } = require('crypto');
/* Server classe */

class ServerClass {
    // Inject value into the classe
    constructor(){
        // Set server properties
        this.app = express();
        //this.app.use(cors())
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

        this.app.use( (request, response, next) => {
            /* 
                [SECURITY] CORS
                Define allowed access
            */
                response.setHeader('Access-Control-Allow-Origin', "*")
                response.header('Access-Control-Allow-Credentials', true);
                response.header('Access-Control-Allow-Methods', this.allowedMethods);
                response.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');
            //
                if(request.method === 'OPTIONS'){ response.sendStatus(200) }
                else{
                    next();
                }
            //
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

    async moviedatabase(url){
    try{
        var data = await fetch('https://api.themoviedb.org/3/' + url);
        var json = await data.json();
        if(json.success == false){
            return null;
        }
    }catch(err){
        return false;
    }
    return json;
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

    //Generate Token

    generatetoken(id, email, password){
        let userToken = jwt.sign(
            { 
                id: id,
                email: email,
                password: password
            }, 
            process.env.SERVER_JWT_SECRET
        );
        
        return CryptoJS.AES.encrypt( userToken, process.env.SERVER_CRYPTO_SECRET ).toString();
    
    }

    // Method to define serveur routes
    bindRoutes(){

    //############################################################
    //# +------------------------------------------------------+ #
    //# |                       Token                          | #
    //# +------------------------------------------------------+ #
    //############################################################
    

    

    this.app.post('/api/get_token', async ( req, res ) => {
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
                    let userToken = this.generatetoken(results[0].id, results[0].email, results[0].password)

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

        this.app.get('/api/user/:id/bookmark', ( req, res ) => {
            res.set('access-control-allow-origin', '*');
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
                    if(results.affectedRows == 1){
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

                        //here 

                        else{

                            let userToken = this.generatetoken(results[0].id, results[0].email, results[0].password)

                            res.cookie('popcorn-token', userToken, { maxAge: 700000, httpOnly: true });

                            return res.status(201).json({ 
                                msg: 'Created',
                                error: null,
                                data: {
                                    "id": results[0].id,
                                    "uuid" : results[0].uuid,
                                    "token": userToken
                                    }
                                    
                            })
                        }
                    });
                    }else{
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: results,
                        })
                    }

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
        //# |                        Movie                         | #
        //# +------------------------------------------------------+ #
        //############################################################
        
        this.app.get('/api/movie/detail/:id', async ( req, res ) => {
            // Get data movie
            this.verifytoken(req, async (result) =>{
                if(result){
                    var detailmovie = await this.moviedatabase(`movie/${req.params.id}?api_key=${process.env.TMDB_TOKEN}&language=fr-FR`);
                    
                    //if service of MovieDataBase not work
                    if(detailmovie == false){
                        return res.status(503).json({ 
                            msg: 'Service Unavailable',
                            error: null,
                            data: null,
                        })
                    }
                    
                    var creditsmovie = await this.moviedatabase(`movie/${req.params.id}/credits?api_key=${process.env.TMDB_TOKEN}&language=fr-FR`);
                    var watchflatratemovie = await this.moviedatabase(`movie/${req.params.id}/watch/providers?api_key=${process.env.TMDB_TOKEN}&language=fr-FR`);
                    var director = null;
                    var flatrate = null;

                    //get director in credit if exisit
                    try{
                    for (const key in creditsmovie.crew) {
                        if(creditsmovie.crew[key].job === "Director"){
                            director = creditsmovie.crew[key].name;
                            break;
                        }
                    }
                    }catch{
                        director = null;
                    }
                    
                    //add flatrate if exisit
                    try{
                        flatrate = watchflatratemovie.results.FR.flatrate;
                    }catch(err){
                        flatrate = null;
                    }
                    
                    
                    if(detailmovie && flatrate && director){
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: {
                                title: detailmovie.title,
                                genres: detailmovie.genres,
                                overview: detailmovie.overview,
                                poster_path: detailmovie.poster_path,
                                release_date: detailmovie.release_date,
                                vote_average: detailmovie.vote_average,
                                director: director,
                                flatrate: flatrate
                            },
                        })
                    }else{
                        return res.status(404).json({ 
                            msg: 'Not Found',
                            error: null,
                            data: null,
                        })
                    }

                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.get('/api/movie/recommendations/:id', async ( req, res ) => {
            // Get Recommendation
            this.verifytoken(req, async (result) =>{
                if(result){
                    var recommendations = await this.moviedatabase(`movie/${req.params.id}/recommendations?api_key=${process.env.TMDB_TOKEN}&language=fr-FR`);
                    
                    //if service of MovieDataBase not work
                    if(recommendations == false){
                        return res.status(503).json({ 
                            msg: 'Service Unavailable',
                            error: null,
                            data: null,
                        })
                    }

                    if(recommendations){
                        return res.status(200).json({ 
                            msg: 'OK',
                            error: null,
                            data: recommendations.results,
                        })
                    }else{
                        return res.status(404).json({ 
                            msg: 'Not Found',
                            error: null,
                            data: null,
                        })
                    }

                }else{
                    return res.status(401).json({ 
                        msg: 'Unauthorized',
                        error: null,
                        data: null,
                    })
                }})
        })

        this.app.get('/api/movie/popular/:nb', async ( req, res ) => {
            var nb = 0;
            var film_liste = [];
            var page = 1;
            while(true){
                var popular = await this.moviedatabase(`movie/popular?api_key=${process.env.TMDB_TOKEN}&language=fr-FR&page=${page}`);
                if(popular == false){
                    return res.status(503).json({ 
                        msg: 'Service Unavailable',
                        error: null,
                        data: null,
                    })
                }
                if(popular){
                    for (const key in popular.results) {
                        if(nb < req.params.nb){
                            film_liste.push(popular.results[key])
                            nb++;
                        }else{
                            return res.status(200).json({ 
                                msg: 'OK',
                                error: null,
                                data: film_liste,
                            })
                        }
                    }
                }else{
                    return res.status(404).json({ 
                        msg: 'Not Found',
                        error: null,
                        data: null,
                    })
                }
                page++;
            }
        
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