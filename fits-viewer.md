Process involved:

  * UI : the HTML/React ui)
  * Backend : the nodejs backend which receives request over websocket. It maintains a shared memory segment
  * Image.CGI : process images, writing intermediate steps into a shared memory segment

Typical exchange:

```
  UI     Backend       CGI

  ---SRC---->                      The UI request for an Image for a fit
  <----UID---                      The backend store the request and returns an UID

  ------/img?u=UID----->           query from UI:
	  <-------------           What about UID ?
          ------------->           TODOList: E1:parse('/usr/local/bidule.fits')
          <-------------           Done(@produce size, depth, bayer)
				   The backend requalifie the UID request (apply auto size for example)
          ------------->           TODOList: E2:read('/usr/local/bidule.fits', buffer:in=@0x111002), E3:autoHisto(in=@0x111002, out@0x1432321), E4: sendImage(in=@0x14322321, bin=4)
						=> backend reserve all memories now (to prevent starvation)
	  ...
          <-------------           Done:E2 => backend may start other jobs using the content of bidule.fits
  <---------------------           The backend can stream the result before E2 is completed
          <-------------           Done:E3 => backend may free the content of the first buffer
	  <-------------           Done:E4 (when the buffer has been fully read)
	  <-------------           Disconnect
```

On the backend side:
	* A list of CGI clients is maintened
				=> status: waiting query, pending todolist (while waiting for resources), processing todolist
				=> actual query (if received)
				=> current todolist (with related buffers)
				=> aborted received
	* A map of buffers is maintened. Each buffer has:
				=> an identifier from the process parameters that built it (ie a json description)
				=> the current producer xor the current readers
				=> the status (todo, processing, done)
				=> the last use time (for LRU discarding)
				=> the number of pending client that want this buffer
				=> the offset/size in shm (optional; fits description can be 

When a query is received, the backend creates a todolist for the client and put it in the client pendinglist

Dispatch todolist to CGI:

When no more than x CGI is running (is should be limited since they are already multi-threaded)
backend tries to allocate memory for the first client (fixme: prio ?). If not possible, the backend tries to free memory blocks (one by one in descending last use time/number of pending clients)
until possible or no more blocs could be freed.


Cons: a hung CGI could stop the whole process by holding memory. The sendimage should buffer the resulting image buffer in its own memory space (if not too big) ? or timeout (controlable on client side)



check that net connection is closed when image loading aborts 
	=> ok with direct connection (firefox/chrome)
	=> WTF with node proxy
	=> nginx

Front server:
	* nodejs : lot of pipe
	* nginx: no support for cgi (fastcgi is not that fast)
	* lighttpd: 
	* apache:


check no race condition can occur if a CGI close its conn to backend while still processing (shmdt first ?)

