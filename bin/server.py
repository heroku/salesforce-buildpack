import socket
from os import getenv, environ

HOST, PORT = '', int(getenv('PORT', 5000))
LOGIN_URL = environ['FORCE_COM_PROTOTYPE_LOGIN_URL']
USERNAME = environ['FORCE_COM_PROTOTYPE_USERNAME']
PASSWORD = environ['FORCE_COM_PROTOTYPE_PASSWORD']

listen_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listen_socket.bind((HOST, PORT))
listen_socket.listen(1)
print 'Serving HTTP on port %s ...' % PORT
while True:
    client_connection, client_address = listen_socket.accept()
    request = client_connection.recv(1024)
    print request

    http_response = """\
HTTP/1.1 200 OK

<html>
  <head>
    <META http-equiv="refresh" content="0;{LOGIN_URL}?un={USERNAME}&amp;pw={PASSWORD}">
  </head>
  <body>
    <h1>Redirecting to your Force.com Application</h1>
  </body>
</html>
""".format(**locals())

    print(http_response)

    client_connection.sendall(http_response)
    client_connection.close()
