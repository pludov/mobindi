#include <iostream>
#include <unistd.h>
#include <cstdint>

#include <cgicc/CgiDefs.h>
#include <cgicc/Cgicc.h>
#include <cgicc/HTTPHTMLHeader.h>
#include <cgicc/HTMLClasses.h>

#include <png.h>

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

using namespace std;
using namespace cgicc;

using nlohmann::json;

namespace IPC {
	struct ImageDetails {
		int width, height;
		std::string bayer;
		int min, max;
	};

	void to_json(json&j, const ImageDetails & i)
	{
		j = json();
		j["width"] = i.width;
		j["height"] = i.height;
		j["bayer"] = i.bayer;
		j["min"] = i.min;
		j["max"] = i.max;
	}

	void from_json(const json& j, ImageDetails & p) {
        p.width = j.at("width").get<int>();
        p.height = j.at("height").get<int>();
        p.bayer = j.at("bayer").get<string>();
        p.min = j.at("min").get<int>();
        p.max = j.at("max").get<int>();
    }
}

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

void write_jpeg_file(u_int8_t * grey, int width, int height, int channels)
{

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
	  FILE * outfile;		/* target file */
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
	  jpeg_stdio_dest(&cinfo, stdout);

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
	  // fclose(outfile);

	  /* Step 7: release JPEG compression object */

	  /* This is an important step since it will release a good deal of memory. */
	  jpeg_destroy_compress(&cinfo);

	  /* And we're done! */
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

// Build an histogram
// Max MPixel handled : 20M => 32 bit counter required
// 64K*4 = 256K/Channel = 1Mo global
class Histo {
	u_int32_t * counts;
	u_int32_t pixcount;
	u_int32_t min, max;
public:
	Histo() {
		counts = new u_int32_t[65536];
		pixcount = 0;
		min = -1;
		max = -1;
	}

	void scanPlane(u_int16_t * data, int w, int h)
	{
		pixcount += w*h;
		while(h > 0) {
			int tw = w;
			while(tw > 0) {
				counts[*data]++;
				data++;
				tw--;
			}
			h--;
		}
	}

	// w and h must be even
	void scanBayer(u_int16_t * data, int w, int h)
	{
		pixcount += w * h / 4;
		int th = h / 2;
		while(th > 0) {
			int tw = w / 2;
			while(tw > 0) {
				counts[*data]++;
				data += 2;
				tw--;
			}
			data += w / 2;
			th--;
		}
	}
	void scanR(u_int16_t * data, int w, int h)
	{
		scanBayer(data, w, h);
	}
	void scanGG(u_int16_t * data, int w, int h)
	{
		scanBayer(data + 1, w, h);
		scanBayer(data + w, w, h);
	}
	void scanB(u_int16_t * data, int w, int h)
	{
		scanBayer(data + w + 1, w, h);
	}

	/** Make count represent the number of pixel at or under a given level */
	void cumulative() {
		u_int32_t current = 0;
		for(int i = 0; i < 65536; ++i) {
			current += counts[i];
			counts[i] = current;
		}
	}

	// first index for which count is at least wantedCount
	u_int32_t findFirstWithAtLeast(u_int32_t wantedCount)
	{
		int min = 0, max = 65535;
		if (counts[min] >= wantedCount) return min;
		while (min < max) {
			int med = (max + min) / 2;
			if (counts[med] < wantedCount) {
				if (med == min) {
					return max;
				}
				min = med;
			} else {
				if (med == max) {
					return min;
				}
				max = med;
			}
		}
		return min;
	}

	// Return the highest adu X that for which at least v% of the pixels are >= X
	u_int32_t getLevel(double v) {
		u_int32_t wantedCount = floor(pixcount * v);
		// Search the first index i in counts for which count[i] >= wantedCount;
		return findFirstWithAtLeast(wantedCount);
	}
};


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

bool readKey(fitsfile * fptr, const std::string & key, std::string * o_value)
{
	char comment[128];
	char * value = NULL;
	int status = 0;
	fits_read_key_longstr(fptr, key.c_str(), &value, comment, &status);
	// FIXME check of status == KEY_NO_EXIST
	if (status > 0) return false;
	if (value == NULL) return false;
	(*o_value) = string(value);
	free(value);
	return true;

}

int getRGBIndex(char c)
{
	switch(c) {
		case 'R':
			return 0;
		case 'G':
			return 1;
		case 'B':
			return 2;
	}
	return -1;
}



int main () {
	Cgicc formData;



	IPC::ImageDetails img = { 320, 200, "RGGB", 0, 32767 };
	json j = img;
	cerr << j;


	string path;

	form_iterator fi = formData.getElement("path");
	if( !fi->isEmpty() && fi != (*formData).end()) {
		path =  **fi;
	}

	cout << "Content-type: image/jpeg\r\n\r\n";


	fitsfile *fptr;
	int status = 0;
	int bitpix, naxis;
	long naxes[2] = {1,1};

//	const char * arg = "/home/ludovic/Astronomie/Photos/Light/Essai_Light_1_secs_2017-05-21T10-03-28_013.fits";
//	path = arg;

	u_int16_t * data;
	fprintf(stderr, "Decoding %s\n", path.c_str());
	if (!fits_open_file(&fptr, path.c_str(), READONLY, &status))
	{
		if (!fits_get_img_param(fptr, 2, &bitpix, &naxis, naxes, &status) )
		{
			fprintf(stderr, "bitpix = %d\n", bitpix);
			fprintf(stderr, "naxis = %d\n", naxis);
			if (naxis != 2) {
				fprintf(stderr, "unsupported axis count\n");
			} else {
				fprintf(stderr, "size=%ldx%ld\n", naxes[0], naxes[1]);

			}

			int w = naxes[0];
			int h = naxes[1];

			int hdupos = 1;
			int nkeys;
			char card[FLEN_CARD];
			string bayer = "";
			string cardBAYERPAT;
			for (; !status; hdupos++)  /* Main loop through each extension */
			{
				fits_get_hdrspace(fptr, &nkeys, NULL, &status); /* get # of keywords */

				fprintf(stderr, "Header listing for HDU #%d:\n", hdupos);

				for (int ii = 1; ii <= nkeys; ii++) { /* Read and print each keywords */

					if (fits_read_record(fptr, ii, card, &status))break;
					fprintf(stderr, "%s\n", card);
				}
				fprintf(stderr, "END\n\n");  /* terminate listing with END */

				if (readKey(fptr, "BAYERPAT", &bayer) && bayer.size() > 0) {
					fprintf(stderr, "BAYER detected");
				}
				fits_movrel_hdu(fptr, 1, NULL, &status);  /* try to move to next HDU */
			}

			status = 0;
			if (bayer.size() > 0) {
				if (bayer.size() != 4) {
					fprintf(stderr, "Ignoring bayer pattern: %s\n", bayer.c_str());
					bayer = "";
				} else {
					bool valid = true;
					for(int i = 0; i < 4; ++i) {
						if (getRGBIndex(bayer[i]) == -1) {
							valid = false;
							break;
						}
					}
					if (!valid) {
						fprintf(stderr, "Ignoring bayer pattern: %s\n", bayer.c_str());
						bayer = "";
					}
				}
			}

			data = new u_int16_t[naxes[0] * naxes[1]];
			u_int8_t * result = new u_int8_t[naxes[0] * naxes[1]];

			long fpixels[2]= {1,1};
			if (!fits_read_pix(fptr, TUSHORT, fpixels, naxes[0] * naxes[1], NULL, (void*)data, NULL, &status)) {
				int nbpix = naxes[0] * naxes[1];

				// do histogram for each channel !
				if (bayer.length() > 0) {
					Histo* histoByColor[3];
					for(int i = 0; i < 3; ++i) {
						histoByColor[i] = new Histo();
					}

					for(int i = 0; i < 4; ++i) {
						int hist = getRGBIndex(bayer[i]);
						int offset = (i & 1) + ((i & 2) >> 1) * w;
						histoByColor[hist]->scanBayer(data + offset, w, h);
					}

					int levels[3][3];
					for(int i = 0; i < 3; ++i) {
						histoByColor[i]->cumulative();
						levels[i][0]= histoByColor[i]->getLevel(0.05);
						levels[i][1]= histoByColor[i]->getLevel(0.5);
						levels[i][2]= histoByColor[i]->getLevel(0.95);
					}


					for(int i = 0; i < 4; ++i) {
						int offset = (i & 1) + ((i & 2) >> 1) * w;
						int hist = getRGBIndex(bayer[i]);
						applyScaleBayer(data + offset, w, h, levels[hist][0], levels[hist][1], levels[hist][2], result + offset);
					}
				} else {
					Histo * histo = new Histo();
					histo->scanPlane(data, naxes[0], naxes[1]);
					histo->cumulative();
					int min = histo->getLevel(0.05);
					int med = histo->getLevel(0.5);
					int max = histo->getLevel(0.95);
					fprintf(stderr, "levels are %d %d %d", min, med, max);
					applyScale(data, w, h, min, med, max, result);
				}

				// Let's bin 2x2
				if (bayer.length() > 0) {
					u_int8_t * superPixel = (u_int8_t*)malloc(3 * (w * h / 4));
					debayer(result, w, h, superPixel);
					// DO super pixel !
					write_jpeg_file(superPixel, w / 2, h / 2, 3);
					free(superPixel);

				} else {
					write_jpeg_file(result, w, h, 1);
				}
			}


		}
		fits_close_file(fptr, &status);
	}

	return 0;
}
