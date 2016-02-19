import socket
import SimpleHTTPServer
import SocketServer
from os import getenv, environ

HOST, PORT = '', int(getenv('PORT', 5000))
LOGIN_URL = environ['FORCE_COM_PROTOTYPE_WEB_LOGIN_URL']
USERNAME = environ['FORCE_COM_PROTOTYPE_USERNAME']
PASSWORD = environ['FORCE_COM_PROTOTYPE_PASSWORD']

class myHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
   def do_GET(self):
       print self.path
       self.send_response(303)
       new_path = '%s?un=%s&pw=%s'%(LOGIN_URL, USERNAME, PASSWORD)
       self.send_header('Location', new_path)
       self.end_headers()

handler = SocketServer.TCPServer(("", PORT), myHandler)
print "serving at port {PORT}".format(PORT=PORT)
handler.serve_forever()
