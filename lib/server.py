import socket
import SimpleHTTPServer
import SocketServer
import re
from os import getenv, environ
import urllib2
import json

HOST, PORT = '', int(getenv('PORT', 5000))
FORCE_COM_ALM_URL = environ['FORCE_COM_ALM_URL']

pattern = "force://(.*):(.*):(.*)@(.*)"

m = re.search(pattern, FORCE_COM_ALM_URL)

client_id=m.group(1)
client_secret=m.group(2)
refresh_token=m.group(3)
instance = m.group(4)

url = "https://%s/services/oauth2/token?grant_type=refresh_token&client_id=%s&client_secret=%s&refresh_token=%s" % (instance, client_id, client_secret, refresh_token)
print url
req = urllib2.Request(url, None)
req.get_method = lambda: "POST"
response = urllib2.urlopen(req)
data = response.read()
print data
data = json.loads(data)
access_token=data['access_token']

login_url = "https://%s/secur/frontdoor.jsp" % (instance)

class myHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
   def do_GET(self):
       print self.path
       self.send_response(303)
       new_path = '%s?sid=%s'%(login_url, access_token)
       self.send_header('Location', new_path)
       self.end_headers()

handler = SocketServer.TCPServer(("", PORT), myHandler)
print "serving at port {PORT}".format(PORT=PORT)
handler.serve_forever()
