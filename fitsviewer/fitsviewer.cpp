#include <iostream>
#include <unistd.h>
#include <cstdint>

#include <cgicc/CgiDefs.h>
#include <cgicc/Cgicc.h>
#include <cgicc/HTTPHTMLHeader.h>
#include <cgicc/HTMLClasses.h>

#include <png.h>

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

	cout << "Content-type: image/png\r\n\r\n";


	fitsfile *fptr;
	int status = 0;
	int bitpix, naxis;
	long naxes[2] = {1,1};

	// const char * arg = "/home/ludovic/Astronomie/Photos/Light/Essai_Light_1_secs_2017-05-21T10-03-28_013.fits";

	u_int16_t * data;

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


			int hdupos = 1;
			int nkeys;
			char card[FLEN_CARD];
			for (; !status; hdupos++)  /* Main loop through each extension */
			{
				fits_get_hdrspace(fptr, &nkeys, NULL, &status); /* get # of keywords */

				fprintf(stderr, "Header listing for HDU #%d:\n", hdupos);

				for (int ii = 1; ii <= nkeys; ii++) { /* Read and print each keywords */

					if (fits_read_record(fptr, ii, card, &status))break;
					fprintf(stderr, "%s\n", card);
				}
				fprintf(stderr, "END\n\n");  /* terminate listing with END */

				fits_movrel_hdu(fptr, 1, NULL, &status);  /* try to move to next HDU */
			}

			status = 0;

			data = new u_int16_t[naxes[0] * naxes[1]];
			u_int8_t * result = new u_int8_t[naxes[0] * naxes[1]];

			long fpixels[2]= {1,1};
			if (!fits_read_pix(fptr, TUSHORT, fpixels, naxes[0] * naxes[1], NULL, (void*)data, NULL, &status)) {
				int nbpix = naxes[0] * naxes[1];

				// FIXME: do histogram for each channel !
				// FIXME: debayer !
				// FIXME: bin

				for(int i = 0; i < nbpix; ++i) {
					result[i] = (data[i] >> 7);
				}

				write_png_file(result, naxes[0], naxes[1]);
			}


		}
		fits_close_file(fptr, &status);
	}

	return 0;
}
