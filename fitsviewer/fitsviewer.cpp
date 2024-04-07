#include <iostream>
#include <algorithm>
#include <unistd.h>
#include <cstdint>
#include <stdio.h>
#include <poll.h>
#include <sys/uio.h>
#include <cgicc/CgiDefs.h>
#include <cgicc/Cgicc.h>
#include <cgicc/HTTPResponseHeader.h>
#include <cgicc/HTTPContentHeader.h>
#include <cgicc/HTMLClasses.h>

#include <png.h>
#include <zlib.h>
#include <stdio.h>

/*
 * Include file for users of JPEG library.
 * You will need to have included system headers that define at least
 * the typedefs FILE and size_t before you can include jpeglib.h.
 * (stdio.h is sufficient on ANSI-conforming systems.)
 * You may also wish to include "jerror.h".
 */

#include "jpeglib.h"

/*
 * <setjmp.h> is used for the optional error recovery mechanism shown in
 * the second part of the example.
 */

#include <setjmp.h>


#include "json.hpp"
#include "fitsio.h"
#include "SharedCache.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"

#include "FitsRenderer.h"


using namespace std;
using namespace cgicc;

using nlohmann::json;

static bool disableHttp = false;
static bool disableOutput = false;


static void writeStreamBuff(void * buffer, size_t length)
{
	int wanted, got;
	if (length == 0) {
		if (disableHttp) {
			return;
		}
		const char * text = "0\r\n\r\n";
		wanted = strlen(text);
		got = write(1, text, wanted);
	} else {
		char separator[64];
		int sepLength = snprintf(separator, 64, "%lx\r\n", length);

		struct iovec vecs[3];
		vecs[0].iov_base = separator;
		vecs[0].iov_len = sepLength;
		vecs[1].iov_base = buffer;
		vecs[1].iov_len = length;
		vecs[2].iov_base = separator + sepLength - 2;
		vecs[2].iov_len = 2;

		wanted = vecs[0].iov_len + length + 2;

		if (disableHttp) {
			wanted -= vecs[0].iov_len;
			vecs[0].iov_len = 0;
			wanted -= vecs[2].iov_len;
			vecs[2].iov_len = 0;
		}

		got = writev(1, vecs, 3);
	}
	if (got == -1) {
		perror("write");
		exit(0);
	}
	if (got < wanted) {
		exit(0);
	}
}

struct own_jpeg_destination_mgr : public jpeg_destination_mgr {
	uint8_t * buffer;
	size_t buffSze;
public:
	own_jpeg_destination_mgr() {
		init_destination = &static_init_destination;
		empty_output_buffer = &static_empty_output_buffer;
		term_destination = &static_term_destination;
		buffSze = 16384;
		buffer = (uint8_t*)malloc(buffSze);
	}

	~own_jpeg_destination_mgr() {
		free(buffer);
	}

	void reset()
	{
		next_output_byte = buffer;
		free_in_buffer = buffSze;
	}
	void flush()
	{
		size_t length = next_output_byte - buffer;
		if (length) {
			writeStreamBuff(buffer, length);
			reset();
		}
	}

	void memberInit() {
		reset();
	}

	void memberOutputBuffer() {
		writeStreamBuff(buffer, buffSze);
		reset();
	}

	void memberTermDestination() {
		flush();
	}

	static void static_init_destination(j_compress_ptr cinfo)
	{
		((own_jpeg_destination_mgr*)cinfo->dest)->memberInit();
	}
	static boolean static_empty_output_buffer(j_compress_ptr cinfo)
	{
		((own_jpeg_destination_mgr*)cinfo->dest)->memberOutputBuffer();
		return true;
	}
	static void static_term_destination(j_compress_ptr cinfo)
	{
		((own_jpeg_destination_mgr*)cinfo->dest)->memberTermDestination();
	}
};


class JpegWriter
{
	int width, height, channels, quality;

	/* This struct contains the JPEG compression parameters and pointers to
	 * working space (which is allocated as needed by the JPEG library).
	 * It is possible to have several such structures, representing multiple
	 * compression/decompression processes, in existence at once.  We refer
	 * to any one struct (and its associated working data) as a "JPEG object".
	 */
	struct jpeg_compress_struct cinfo;

	/* This struct represents a JPEG error handler.  It is declared separately
	 * because applications often want to supply a specialized error handler
	 * (see the second half of this file for an example).  But here we just
	 * take the easy way out and use the standard error handler, which will
	 * print a message on stderr and call exit() if compression fails.
	 * Note that this struct must live as long as the main JPEG parameter
	 * struct, to avoid dangling-pointer problems.
	 */
	struct jpeg_error_mgr jerr;
	own_jpeg_destination_mgr destMgr;
public:
	JpegWriter(int w, int h, int channels, int quality)
	{
		this->width = w;
		this->height = h;
		this->channels = channels;
		this->quality = quality;

	}

	void start()
	{
		if (disableOutput) return;

		  /* Step 1: allocate and initialize JPEG compression object */

		  /* We have to set up the error handler first, in case the initialization
		   * step fails.  (Unlikely, but it could happen if you are out of memory.)
		   * This routine fills in the contents of struct jerr, and returns jerr's
		   * address which we place into the link field in cinfo.
		   */
		  cinfo.err = jpeg_std_error(&jerr);
		  /* Now we can initialize the JPEG compression object. */
		  jpeg_create_compress(&cinfo);

		  /* Step 2: specify data destination (eg, a file) */
		  /* Note: steps 2 and 3 can be done in either order. */

		  /* Here we use the library-supplied code to send compressed data to a
		   * stdio stream.  You can also write your own code to do something else.
		   * VERY IMPORTANT: use "b" option to fopen() if you are on a machine that
		   * requires it in order to write binary files.
		   */
		  cinfo.dest = &destMgr;
		  /* Step 3: set parameters for compression */

		  /* First we supply a description of the input image.
		   * Four fields of the cinfo struct must be filled in:
		   */
		  cinfo.image_width = width; 	/* image width and height, in pixels */
		  cinfo.image_height = height;
		  cinfo.input_components = channels;		/* # of color components per pixel */
		  cinfo.in_color_space = channels == 1 ? JCS_GRAYSCALE : JCS_RGB; 	/* colorspace of input image */
		  /* Now use the library's routine to set default compression parameters.
		   * (You must set at least cinfo.in_color_space before calling this,
		   * since the defaults depend on the source color space.)
		   */
		  jpeg_set_defaults(&cinfo);
		  /* Now you can set any non-default parameters you wish to.
		   * Here we just illustrate the use of quality (quantization table) scaling:
		   */

		  jpeg_set_quality(&cinfo, quality, TRUE /* limit to baseline-JPEG values */);
		  if (quality < 80) {
		  	cinfo.dct_method = JDCT_IFAST;
		  }

		  // For progressive, use: jpeg_simple_progression(&cinfo);
		  // But in that case, the compression will not be streamed.

		  /* Step 4: Start compressor */
		  /* TRUE ensures that we will write a complete interchange-JPEG file.
		   * Pass TRUE unless you are very sure of what you're doing.
		   */
		  jpeg_start_compress(&cinfo, TRUE);

		  destMgr.flush();
	}

	void writeLines(uint8_t * grey, int height) {
		if (disableOutput) return;

		JSAMPROW row_pointer[32];	/* pointer to JSAMPLE row[s] */
		int row_stride;		/* physical row width in image buffer */

		/* Step 5: while (scan lines remain to be written) */
		/*           jpeg_write_scanlines(...); */

		/* Here we use the library's state variable cinfo.next_scanline as the
		 * loop counter, so that we don't have to keep track ourselves.
		 * To keep things simple, we pass one scanline per call; you can pass
		 * more if you wish, though.
		 */
		row_stride = channels * width;	/* JSAMPLEs per row in image_buffer */

		int y = 0;
		while(y < height) {
			int count = 0;
			for(int i = 0; i < 32 && y < height; ++i) {
				row_pointer[i] = grey + y * row_stride;
				y++;
				count++;
			}
			(void) jpeg_write_scanlines(&cinfo, row_pointer, count);
		}
	}

	void finish()
	{
		if (disableOutput) return;

		/* Step 6: Finish compression */
		jpeg_finish_compress(&cinfo);


		/* Step 7: release JPEG compression object */
		/* This is an important step since it will release a good deal of memory. */
		jpeg_destroy_compress(&cinfo);
	}

};


void write_png_file(u_int8_t * grey, int width, int height)
{
        /* create file */
        FILE *fp = stdout; // fopen(file_name, "wb");


        /* initialize stuff */
        auto png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);

        if (!png_ptr)
        	throw std::string("[write_png_file] png_create_write_struct failed");

        auto info_ptr = png_create_info_struct(png_ptr);
        if (!info_ptr)
                throw "[write_png_file] png_create_info_struct failed";

        if (setjmp(png_jmpbuf(png_ptr)))
                throw "[write_png_file] Error during init_io";

        png_init_io(png_ptr, fp);

        /* write header */
        if (setjmp(png_jmpbuf(png_ptr)))
                throw "[write_png_file] Error during writing header";

        png_set_IHDR(png_ptr, info_ptr, width, height,
                     8, PNG_COLOR_TYPE_GRAY, PNG_INTERLACE_NONE,
                     PNG_COMPRESSION_TYPE_BASE, PNG_FILTER_TYPE_BASE);

        png_set_compression_level(png_ptr, Z_NO_COMPRESSION);

        png_write_info(png_ptr, info_ptr);


        /* write bytes */
        if (setjmp(png_jmpbuf(png_ptr)))
                throw "[write_png_file] Error during writing bytes";

        u_int8_t * row_pointers[height];
        for(int i = 0; i < height; ++i) {
        	row_pointers[i] = grey;
        	grey += width;
        }

        png_write_image(png_ptr, row_pointers);


        /* end write */
        if (setjmp(png_jmpbuf(png_ptr)))
        	throw "[write_png_file] Error during end of write";

        png_write_end(png_ptr, NULL);

        /* cleanup heap allocation */

        fclose(fp);
}

static double parseFormFloat(Cgicc & formData, const std::string & name, double defaultValue)
{
	std::string value = formData(name);
	if (value == "") {
		return defaultValue;
	}
	try {
		return stod(value);
	} catch (const std::logic_error& ia) {
		std::cerr << "Invalid argument: " << ia.what() << '\n';
		return defaultValue;
	}
}

static void removeArgs(int & argc, char ** argv, int at, int count)
{
	int pos = at;
	while(pos + count < argc) {
		argv[pos] = argv[pos + count];
		pos++;
	}
	argc -= count;
}

static bool findArg(int & argc, char ** argv, const char * wanted)
{
	for(int i = 1; i < argc; ++i)
	{
		if (!strcmp(argv[i], wanted)) {
			removeArgs(argc, argv, i, 1);
			return true;
		}
	}
	return false;
}

class ImageDesc {
public:
	int width, height;
	bool color;
};

void to_json(nlohmann::json&j, const ImageDesc & i) {
	j = nlohmann::json::object();
	j["width"] = i.width;
	j["height"] = i.height;
	j["color"] = i.color;
}



void sendHttpHeader(const cgicc::HTTPResponseHeader & header)
{
	if (!disableHttp) {
		cout << header;
	}
}

const std::string MimeSeparator = "MobIndi80289de12cb019e944c1dfbf174db799Z";

class ResponseException : public std::runtime_error {
public:
	ResponseException(const std::string & msg) : std::runtime_error(msg) {}
};

class ResponseGenerator {
	Cgicc formData;
	// 128Mo cache
	SharedCache::Cache * cache;

	std::string path;
	std::string stream;
	bool wantSize;
	bool forceGreyscale;
	bool streaming;
	bool firstImage;
	int bin;
	// Bounding box for rendering. Default to full image
	int x0 = -1;
	int y0 = -1;
	int x1 = -1;
	int y1 = -1;

	int quality = 90;
	long lastSerialStream = 0;
public:

	void init(int argc, char ** argv) {
		// This is a power of two of the actual bin (0 => 1x1)
		bin = 0;
		firstImage = true;
		cache = new SharedCache::Cache();

		wantSize = findArg(argc, argv, "--size");
		disableHttp = findArg(argc, argv, "--no-http");
		disableOutput = findArg(argc, argv, "--no-output");
		forceGreyscale = findArg(argc, argv, "--force-greyscale");
		streaming = findArg(argc, argv, "--stream");

		form_iterator fi;
		fi = formData.getElement("size");
		if ((!fi->isEmpty()) && (fi != (*formData).end()) && (**fi == "true")) {
			wantSize = true;
		}

		fi = formData.getElement("quality");
		if ((!fi->isEmpty()) && (fi != (*formData).end())) {
			quality = stod(**fi);
			if (quality < 0) {
				quality = 0;
			}
			if (quality > 100) {
				quality = 100;
			}
		}

		fi = formData.getElement("streamid");
		if (!fi->isEmpty() && fi != (*formData).end()) {
			stream = **fi;
			streaming = true;
		} else if (argc > 1 && streaming) {
			stream = std::string(argv[1]);
		}

		fi = formData.getElement("path");
		if( !fi->isEmpty() && fi != (*formData).end()) {
			path =  **fi;
		} else if (argc > 1 && !streaming) {
			path = std::string(argv[1]);
		}

		fi = formData.getElement("bin");
		if ((!fi->isEmpty()) && (fi != (*formData).end())) {
			bin = stod(**fi);
			if (bin < 0) {
				bin = 0;
			}
			if (bin > 8) {
				bin = 8;
			}
		}

		std::vector<std::string> names = {"x0", "y0", "x1", "y1"};
		std::vector<int*> vars = {&x0, &y0, &x1, &y1};
		for(unsigned int i = 0; i < names.size(); ++i) {
			fi = formData.getElement(names[i]);
			if ((!fi->isEmpty()) && (fi != (*formData).end())) {
				auto v = stod(**fi);
				if (v < 0) {
					v = 0;
				}
				*(vars[i]) = v;
			}
		}
	}

	bool checkOpenForWrite(int fd)
	{
		pollfd polls[1];
		polls[0].fd = fd;
		polls[0].events = POLLHUP|POLLERR|POLLRDHUP;
		int rslt = poll(polls, 1, 0);
		if (rslt == -1) {
			perror("poll");
			return true;
		}
		return !(polls[0].revents & (POLLHUP|POLLERR|POLLRDHUP));
	}

	// Compute the actual bounding box. Requires bin being set
	void calcBoundingBox(int w, int h) {
		// Apply default
		if (x0 == -1) x0 = 0;
		if (y0 == -1) y0 = 0;
		if (x1 == -1) x1 = w - 1;
		if (y1 == -1) y1 = h - 1;

		x0 = binRound(x0, bin);
		y0 = binRound(y0, bin);
		x1 = std::min(binRound(x1, bin) + (1 << bin) - 1, w - 1);
		y1 = std::min(binRound(y1, bin) + (1 << bin) - 1, h - 1);
	
		if (x1 < x0 || y1 < y0) {
			throw ResponseException("Empty image requested");
		}
	}

	void sendJpeg()
	{
		SharedCache::Messages::ContentRequest contentRequest;
		contentRequest.fitsContent = new SharedCache::Messages::RawContent();
		contentRequest.fitsContent->path = !streaming ? path : "";
		contentRequest.fitsContent->stream = streaming ? stream : "";
		contentRequest.fitsContent->serial = lastSerialStream;

		SharedCache::EntryRef aduPlane(cache->getEntry(contentRequest));
		if (aduPlane->hasError()) {
			throw ResponseException(aduPlane->getErrorDetails());
		}
		contentRequest = SharedCache::Messages::ContentRequest(*aduPlane->getActualRequest());
		lastSerialStream = contentRequest.fitsContent->serial;

		RawDataStorage * storage = (RawDataStorage *)aduPlane->data();

		if (wantSize) {
			cgicc::HTTPResponseHeader header("HTTP/1.1", 200, "OK");
			header.addHeader("Content-Type", "application/json");
			header.addHeader("connection", "close");
			sendHttpHeader(header);

			ImageDesc desc;
			desc.width = storage->w;
			desc.height = storage->h;
			desc.color = storage->hasColors();

			nlohmann::json j = desc;
			cout << j.dump() << "\n";
			exit(0);
		}

		double low = parseFormFloat(formData, "low", 0.05);
		double med = parseFormFloat(formData, "med", 0.5);
		double high = parseFormFloat(formData, "high", 0.999);

		SharedCache::Messages::ContentRequest histogramRequest;
		histogramRequest.histogram.build();
		histogramRequest.histogram->source = *contentRequest.fitsContent;
		// histogramRequest.histogram->source.exactSerial = true;

		SharedCache::EntryRef histogram(cache->getEntry(histogramRequest));
		if (histogram->hasError()) {
			throw ResponseException(histogram->getErrorDetails());
		}

		startJpegBlock();

		HistogramStorage * histogramStorage = (HistogramStorage*)histogram->data();

		int w = storage->w;
		int h = storage->h;
		std::string bayer = storage->getBayer();

		uint16_t * data = storage->data;

		bool color = forceGreyscale ? false : bayer.length() > 0;

		if (color) {
			// Bin 1 (aka debayer) not supported.
			if (bin < 1) {
				bin = 1;
			}
		}

		calcBoundingBox(w, h);

		FitsRenderer * renderer;
		{
			FitsRendererParam r;
			r.data = data;
			r.w = w;
			r.h = h;
			r.bin = bin;
			r.low = low;
			r.med = med;
			r.high = high;

			r.bayer = color ? bayer : "";
			r.histogramStorage = histogramStorage;

			renderer = FitsRenderer::build(r);
		}
		
		int sx = x1 - x0 + 1;
		int sy = y1 - y0 + 1;
		
		JpegWriter writer(binDiv(sx, bin), binDiv(sy, bin), color ? 3 : 1, quality);
		writer.start();

		int stripHeight = 32 << bin;

		renderer->prepare();

		int y = y0;
		while(y <= y1) {
			int yleft = y1 + 1 - y;
			if (yleft > stripHeight) yleft = stripHeight;

			auto buffer = renderer->render(x0, y, sx, yleft);

			writer.writeLines(buffer, binDiv(yleft, bin));
			y += yleft;
		}

		delete renderer;

		// Release early
		histogram->release();
		aduPlane->release();

		writer.finish();

		endJpegBlock();
	}

	void startJpegBlock() {
		cgicc::HTTPResponseHeader header("HTTP/1.1", 200, "OK");
		header.addHeader("Content-Type", "image/jpeg");
		header.addHeader("Transfer-Encoding", "chunked");
		header.addHeader("connection", "close");
		sendHttpHeader(header);
	}

	void endJpegBlock() {
		writeStreamBuff(nullptr, 0);
	}

	void perform() {
		try {
			sendJpeg();
		} catch(const ResponseException & e) {
			if (disableHttp) {
				std::cerr << "Error: " << e.what() << '\n';
			} else {
				sendHttpHeader(cgicc::HTTPResponseHeader("HTTP/1.1", 500, e.what()));
			}
			return;
		}
	}
};

int main (int argc, char ** argv) {
	ResponseGenerator resp;
	resp.init(argc, argv);
	resp.perform();
}
