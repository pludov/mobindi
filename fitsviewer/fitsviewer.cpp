#include <iostream>
#include <unistd.h>
#include <cstdint>

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

using namespace std;
using namespace cgicc;

using nlohmann::json;

void debayer(u_int8_t * data, int width, int height, u_int8_t * target)
{

	for(int y = 0; y < height; y += 2)
	{
		for(int x = 0; x < width; x += 2)
		{
			target[0] = data[0];
			target[1] = (((int)data[1]) + data[width]) / 2;
			target[2] = data[width + 1];
			target += 3;
			data+= 2;
		}
		data += width;
	}
}

struct JpegContent {
	unsigned char * data;
	unsigned long memsize;

	JpegContent() {
		data = nullptr;
		memsize = 0;
	}
};

JpegContent write_jpeg_file(u_int8_t * grey, int width, int height, int channels)
{
	struct JpegContent result;
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
	  /* More stuff */
	  JSAMPROW row_pointer[32];	/* pointer to JSAMPLE row[s] */
	  int row_stride;		/* physical row width in image buffer */

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
	  jpeg_mem_dest(&cinfo, &result.data, &result.memsize);

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
	  jpeg_set_quality(&cinfo, 90, TRUE /* limit to baseline-JPEG values */);

	  /* Step 4: Start compressor */

	  /* TRUE ensures that we will write a complete interchange-JPEG file.
	   * Pass TRUE unless you are very sure of what you're doing.
	   */
	  jpeg_start_compress(&cinfo, TRUE);

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

	  /* Step 6: Finish compression */

	  jpeg_finish_compress(&cinfo);
	  /* After finish_compress, we can close the output file. */

	  /* Step 7: release JPEG compression object */

	  /* This is an important step since it will release a good deal of memory. */
	  jpeg_destroy_compress(&cinfo);
	  cerr << "jpeg write done: " << result.memsize << "\n";
	  /* And we're done! */
	  return result;
}

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

void applyScale(u_int16_t * data, int w, int h, int min, int med, int max, u_int8_t * result)
{
	int nbpix = w * h;
	for(int i = 0; i < nbpix; ++i) {
		int v = data[i];
		if (v > max) v = max;
		v -= min;
		if (v < 0) v = 0;

		v = v * 256 / (max - min + 1);
		result[i] = v;
	}
}

void applyScaleBayer(u_int16_t * data, int w, int h, int min, int med, int max, u_int8_t * result)
{
	h /= 2;
	w /= 2;
	while(h > 0) {
		int tx = w;
		while(tx > 0) {
			int v = (*data);
			data += 2;
			if (v > max) v = max;
			v -= min;
			if (v < 0) v = 0;

			v = v * 256 / (max - min + 1);
			(*result) = v;
			result+= 2;
			tx--;
		}
		// Skip a line
		result += w;
		result += w;
		data += w;
		data += w;
		h--;
	}
}



int main (int argc, char ** argv) {
	Cgicc formData;
	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);

	string path;

	form_iterator fi = formData.getElement("path");
	if( !fi->isEmpty() && fi != (*formData).end()) {
		path =  **fi;
	} else if (argc > 1) {
		path = std::string(argv[1]);
	} else {
		path = "/home/ludovic/Astronomie/Photos/Light/Essai_Light_1_secs_2017-05-21T10-02-41_009.fits";
	}



//	const char * arg = "/home/ludovic/Astronomie/Photos/Light/Essai_Light_1_secs_2017-05-21T10-03-28_013.fits";
//	path = arg;

	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.fitsContent = new SharedCache::Messages::RawContent();
	contentRequest.fitsContent->path = path;

	SharedCache::EntryRef aduPlane(cache->getEntry(contentRequest));
	if (aduPlane->hasError()) {
		cgicc::HTTPResponseHeader header("HTTP/1.1", 500, aduPlane->getErrorDetails().c_str());
		exit(1);
	}

	contentRequest.fitsContent.clear();
	contentRequest.histogram.build();
	contentRequest.histogram->source.path = path;
	SharedCache::EntryRef histogram(cache->getEntry(contentRequest));
	if (histogram->hasError()) {
		cgicc::HTTPResponseHeader header("HTTP/1.1", 500, histogram->getErrorDetails().c_str());
		exit(1);
	}

	JpegContent resultContent;
	RawDataStorage * storage = (RawDataStorage *)aduPlane->data();
	HistogramStorage * histogramStorage = (HistogramStorage*)histogram->data();

	int w = storage->w;
	int h = storage->h;
	std::string bayer = storage->getBayer();

	u_int8_t * result = new u_int8_t[w * h];
	uint16_t * data = storage->data;

	int nbpix = w * h;

	// do histogram for each channel !
	if (bayer.length() > 0) {
		int levels[3][3];
		for(int i = 0; i < 3; ++i) {
			auto channelStorage = histogramStorage->channel(i);
			levels[i][0]= channelStorage->getLevel(0.05);
			levels[i][1]= channelStorage->getLevel(0.5);
			levels[i][2]= channelStorage->getLevel(0.95);
		}


		for(int i = 0; i < 4; ++i) {
			int offset = (i & 1) + ((i & 2) >> 1) * w;
			int hist = RawDataStorage::getRGBIndex(bayer[i]);
			applyScaleBayer(data + offset, w, h, levels[hist][0], levels[hist][1], levels[hist][2], result + offset);
		}
	} else {
		auto channelStorage = histogramStorage->channel(0);

		int min = channelStorage->getLevel(0.05);
		int med = channelStorage->getLevel(0.5);
		int max = channelStorage->getLevel(0.95);
		fprintf(stderr, "levels are %d %d %d", min, med, max);
		applyScale(data, w, h, min, med, max, result);
	}
	histogram->release();
	cgicc::HTTPResponseHeader header("HTTP/1.1", 200, "OK");
	header.addHeader("Content-Type", "image/jpeg");
	cout << header;

	// Let's bin 2x2
	if (bayer.length() > 0) {
		u_int8_t * superPixel = (u_int8_t*)malloc(3 * (w * h / 4));
		debayer(result, w, h, superPixel);
		// DO super pixel !
		resultContent = write_jpeg_file(superPixel, w / 2, h / 2, 3);
		free(superPixel);

	} else {
		resultContent = write_jpeg_file(result, w, h, 1);
	}
	write(1, resultContent.data, resultContent.memsize);

	delete [] result;

	return 0;
}
