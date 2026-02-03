import jwt from 'jsonwebtoken';
import OAuth from 'oauth-1.0a';
import crypto, { verify } from 'crypto';

let JWT_SECRET = "";

export default {
  async fetch(request: any, 
    env: { CANVAS_CONSUMER_KEY: any; CANVAS_SHARED_SECRET: any; SECRET_KEY: any; JWT_SECRET: string;},
     ctx: any) {
    const secretKey = env.SECRET_KEY;
    JWT_SECRET = env.JWT_SECRET;
        if (request.method === "POST") {
            let resp = await PO(request, env);
            return resp;
  }
  return new Response("Hello World!");
},};

const NextResponse = {
    async json(jso: { error: string; msg?: { token_data: string; }; }, io: ResponseInit | undefined) {
        return new Response(JSON.stringify(jso), io);
    }
}

async function PO(req: { json: () => any; },
env: { CANVAS_CONSUMER_KEY: any; CANVAS_SHARED_SECRET: any; SECRET_KEY: any; JWT_SECRET: string; }) {
  let theR = await req.json();
    if (!theR.msg) {
        return NextResponse.json({ error: "Please include the message in the request. " }, { status: 500 });
    }
     if (theR.type === "processLTILaunch") {
        if (!theR.url) {
            return NextResponse.json({ error: "Put the url to verify against in this request." }, { status: 500 });
        }
        let oauth = new OAuth({
            consumer: {
                "key": env.CANVAS_CONSUMER_KEY,
                "secret": env.CANVAS_SHARED_SECRET
            },
            signature_method: "HMAC-SHA1",
            hash_function(base_string, key) {
                return crypto.createHmac('sha1', key).update(base_string).digest('base64');
            }

        })
        if (!verifyLaunchRequest(oauth, theR.msg, req, theR.url)) {
            return NextResponse.json({
                "error": "Invalid LTI Launch"
            }, { status: 500 });
        }
        let toPass = theR.msg;
        return NextResponse.json({
            "error": "success",
            "msg": {
                "token_data": jwt.sign({
                    fullName: toPass.lis_person_name_full,
                    lis_result_sourcedid: toPass.lis_result_sourcedid,
                    entitlements: toPass.lis_result_sourcedid ? "Student" : "Instructor"
                }, JWT_SECRET)
            }
        }, {
            status: 200
        })

    }
    function verifyLaunchRequest(oauth: OAuth, requestMsg: any, req: any, rUrl: any) {
      //change 'this' to something else
    let ma = requestMsg;
    let cloned = { ...ma };
    delete cloned.oauth_signature;
    let theSig = oauth.getSignature({
        data: cloned,
        url: rUrl,
        method: "POST",

    }, "this",{
        ...cloned
    });

    return ma.oauth_signature === theSig
}

}