#include <cstdint>
#include <math.h>
#include <iostream>
#include <stdlib.h>

#include "LookupTable.h"

LookupTable::LookupTable(int min, int median, int max) {
	reset();
	if (min < 0) min = 0;
	if (min > 65535) min = 65535;
	if (max > 65535) max = 65535;
	if (max < min) {
		max = min;
	}
	if (median < min) {
		median = min;
	}
	if (median > max) {
		median = max;
	}
	init(min, median, max);
}

LookupTable::~LookupTable()
{
	release();
}

void LookupTable::reset()
{
	min = 0;
	max = 0;
	med = 0;
	split = 0;
	shift1 = 0;
	shift2 = 0;
	data1 = 0;
	data2 = 0;
}

void LookupTable::release() {
	if (data1) {
		free(data1);
	}
	if (data2) {
		free(data2);
	}
	reset();
}


int LookupTable::getValue(double i) const
{
	if (i <= min) return 0;
	if (i >= max) return 255;
	double m = (med - min) * 1.0 / (max - min);
	double x = (i - min) * 1.0 / (max - min);

	double v = (m-1) * x / ((2 * m - 1) * x - m);
	int r = round(v * 255);
	if (r < 0 || r > 255) {
		std::cerr << "@" << i << " => " << r << "hist=[" << min << "," << med << "," << max << "]\n";
	}
	return r;
}


uint8_t LookupTable::getIntValue(int32_t i, uint8_t shift)
{

	int64_t min = this->min << shift;
	int64_t max = this->max << shift;
	int64_t med = this->med << shift;


	if (med == min) {
		return (i == min) ? 0 : 255;
	}
	if (med == max) {
		return (i == max) ? 255 : 0;
	}

	int rslt = -(((max-med)*min+i*med-i*max) * 510) / ((med-2*max+i)*min+(max-2*i)*med+i*max);
	// round (take 9 bit, add one, shift one).
	rslt++;
	rslt = rslt >>1;
	if (rslt < 0) rslt = 0;
	if (rslt > 255) rslt = 255;

#ifdef LOOKUPTABLES_CHECKING
	double m = (med - min) * 1.0 / (max - min);
	double x = (i - min) * 1.0 / (max - min);
	double v = (m-1) * x / ((2 * m - 1) * x - m);
	int r = round(v * 255);

	if (abs(rslt - r) > 2) {
		std::cerr << "Erreur de calcul\n";
	}
#endif
	return rslt;
}

double LookupTable::getRoundedI(int i)
{
	double roundedI;
	if (i < split) {
		roundedI = min + (((i - min) >> shift1) << shift1);
		int maxI = roundedI + ((1 << shift1) - 1);
		if (maxI > split) {
			maxI = split;
		}
		roundedI = (roundedI + maxI) / 2;

	} else {
		roundedI = split + (((i - split) >> shift2) << shift2);
		int maxI = roundedI + ((1 << shift2) - 1);
		if (maxI > max) {
			maxI = max;
		}
		roundedI = (roundedI + maxI) / 2;
	}
#ifdef LOOKUPTABLES_CHECKING
	if (roundedI < min || roundedI > max) {
		throw "Logic Error";
	}
#endif
	return roundedI;
}

int LookupTable::getError(int i)
{
	double roundedI = getRoundedI(i);
	if (i == roundedI) return 0;

	int vi = getValue(i);
	int vj = getValue(roundedI);
	double err = abs(vi - vj);
	if (err > 1) {
		std::cerr << i << ":" << vi << " / " << roundedI << ":" << vj << "=>" << err << "\n";
	}
	return err;
}

int LookupTable::getMaxError(int from, int to)
{
	int maxErr = 0;
	for(int i = from; i <= to; ++i) {
		int err = getError(i);
		if (maxErr < err) {

			maxErr = err;
		}
	}
	return maxErr;
}

// Inclusive size
static int sizeFor(int from, int to, int shift)
{
	int diff = (to - from + 1);
	return (diff + ((1 << shift) - 1)) >> shift;
}

int LookupTable::size() const{
	return sizeFor(min, med, shift1) + sizeFor(med, max, shift2);
}

// The lookup will have two segments that will be under-sampled as much as possible
// We are looking for the area where the error will be above 1 for a given sampling
// in order to keep the segments as small as possible
//
// L'ecart maxi sur une periode c'est:
//
// max(  abs ((m-1) * (x - d) / ((2m - 1) ( x - d) - m) - (m-1)*(x + d) / ((2m-1)(x + d) -m) ))
//
// On sait que notre fonction est croissante (f(x-d) < f(x + d))
// On veut trouver les valeur ou :
//         f(x-d) - f(x + d) > V
//         d <= x <= 1-d
//         0<=d < 1
//		   0 < m < 1
//
//       (m-1) * (x - d) / ((2m - 1) ( x - d) - m) >= 0
//       (m-1) <=0
// donc: (x - d) / ((2m - 1) ( x - d) - m) <= 0
//       (x - d) >=0
// donc: 1 / ((2m - 1) ( x - d) - m) <= 0
// donc: ((2m - 1) ( x - d) - m) <= 0
//
// (m-1) * (x - d) / ((2m - 1) ( x - d) - m) - (m-1)*(x + d) / ((2m-1)(x + d) -m) - V > 0
//
//    en mutlipliant par ((2m - 1) ( x - d) - m)  (<= 0):
// (m-1) * (x - d) - ((2m - 1) ( x - d) - m) * (m-1)*(x + d) / ((2m-1)(x + d) -m) - ((2m - 1) ( x - d) - m) * V < 0
//    en multipliant par ((2m-1)(x + d) -m) (<=0 aussi):
// (m-1) * (x - d) * ((2m-1)(x + d) -m) - ((2m - 1) ( x - d) - m) * (m-1)*(x + d) - ((2m-1)(x + d) -m) * ((2m - 1) ( x - d) - m) * V > 0

//    en factorisant
//  (4*V*m^2*x^2-4*V*m*x^2+V*x^2  - 4*V*m^2*x+2*V*m*x -4*V*d^2*m^2-2*d*m^2+V*m^2+4*V*d^2*m+2*d*m-V*d^2)  < 0

// soit:
//      A * x^2 + B * x + C < 0
//  A=4*V*m^2-4*V*m+V
//  B=-4*V*m^2 + 2*V*m
//  C=-4*V*d^2*m^2-2*d*m^2+V*m^2+4*V*d^2*m+2*d*m-V*d^2
//
// sign(A) est constant


struct Interval {
	double min, max;
	Interval() {
		min = 0;
		max = 0;
	}

	Interval(double v1, double v2) {
		this->min = v1;
		this->max = v2;
	}

	double size() const {
		return max - min;
	}

	Interval toClosestBorder() const {

		if (size() == 0) {
			return *this;
		}
		Interval result;
		if (min < (1 - max)) {
			result.min = 0;
			result.max = max;
		} else {
			result.min = min;
			result.max = 1;
		}
		return result;
	}

	Interval growTo(double base, double bitSize) const
	{
		Interval result;
		if (min == max) {
			return *this;
		}
		if (min == 0) {
			result.min = 0;
			// On fait grossir max pour avoir max = base + k * bitSize
			// k = (max - base) / bitSize
			double k = (max - base) / bitSize;
			k = ceil(k);
			result.max = base + k * bitSize;
			if (result.max > 1) {
				result.max = 1;
			}
			return result;
		} else if (max == 1) {
			// On fait baisser min pour avoir min = base + k * bitSize
			// k = (min - base) / bitSize
			double k = (min - base) / bitSize;
			k = floor(k);
			result.min = base + k * bitSize;
			if (result.min < 0) {
				result.min = 0;
			}
			result.max = 1;
		} else {
			throw "cannot grow non border interval";
		}
		return result;
	}

	Interval neg() const {
		if (size() == 0) {
			return Interval(0,1);
		}
		if (min == 0) {
			return Interval(max, 1);
		}
		if (max == 1) {
			return Interval(0, min);
		}
		throw "cannot negate non border interval";
	}

	Interval remove(const Interval & bordered)
	{
		if (bordered.min == 0) {
			// We can not go below bordered.max
			return Interval(
					min < bordered.max ? bordered.max : min,
					max < bordered.max ? bordered.max : max);
		}
		if (bordered.max == 1) {
			// We can not go above bordered.min
			return Interval(
					min > bordered.min ? bordered.min : min,
					max > bordered.min ? bordered.min : max);
		}
		throw "cannot remove non border interval";
	}

	int sampledSize(int sampling) const
	{
		return ceil((max - min) * (1 << sampling));
	}
};

// m : median (0-1)
// D : le delta à considérer pour l'erreur (1/2^bits)
// V : l'erreur maxi acceptée (1/256 pour 8 bits ?)
Interval getHighErrorArea(double m, double D, double V)
{
	// d est une distance par rapport au centre
	double d = D / 2;
	// On veut en gros A*x² + B * x + C < 0
	double a=-(-4*V*m*m+4*V*m-V);
	double b=-(4*V*m*m-2*V*m);
	double c= -((4*V*d*d-2*d-V)*m*m+(2*d-4*V*d*d)*m+V*d*d);
//	std::cerr << "a" << a << "\n";
//	std::cerr << "b" << b << "\n";
//	std::cerr << "c" << c << "\n";

	double delta = b*b - 4 * a* c;
//	std::cerr << "delta =" << delta << "\n";
	if (delta <= 0) {
		// Pas de solution...
		return Interval(-1,-1);
	}
	// Normalement, a > 0 ?
	if (a < 0) {
		throw "Beurk";
	}
	double x1 = (-b-sqrt(delta))/(2 * a) - 4 *D;
	double x2 = (-b+sqrt(delta))/(2 * a) + 4 *D;

//	std::cerr << "High error interval : " << x1 << "=>" << x2 << "\n";

	if (x1 < 0) x1 = 0;
	if (x2 < 0) x2 = 0;
	if (x1 > 1) x1 = 1;
	if (x2 > 1) x2 = 1;
	return Interval(x1, x2);
}




struct Config {
	int lowBit;
	Interval lowInterval;
	int highBit;
	Interval highInterval;

	int size() const {
		return lowInterval.sampledSize(lowBit) + highInterval.sampledSize(highBit);
	}

};


void LookupTable::init(int imin, int imed, int imax)
{
	release();
	int max = imax - imin;
	if (imin == imax) {
		// WTF ? Just set 0
		this->min = imin;
		this->max = imax;
		this->med = imed;
		this->split = imin;
		this->shift1 = 0; // unused
		this->data1 == 0;
		this->shift2 = 16;
		this->data2 = (uint8_t*)malloc(1);
		this->data2[0] = 0;
	} else if (max <= 255) {
		this->min = imin;
		this->max = imax;
		this->med = imed;
		this->split = imin;
		this->shift1 = 0; // unused
		this->shift2 = 0;
		this->data1 = 0;
		this->data2 = (uint8_t*)malloc(max + 1);
		for(int i = 0; i <= max; ++i) {
			this->data2[i] = getIntValue(imin + i, 0);
		}
	} else {
		double m = (imed - imin) * 1.0/ (imax - imin);

		Config best;
		int bestSize = -1;

		Config current;


		double bitSize = 1.0/(imax - imin + 1);

		// Trouver la plus grande portion couvrable
		for(current.lowBit = 6; current.lowBit <= 16; ++current.lowBit){
	//		std::cerr << "For low bit " << bit << "\n";
			Interval v = getHighErrorArea(m, ((1 << (16 - current.lowBit)) - 1) * bitSize, 1.0 / 256);
			v = v.toClosestBorder();
			// FIXME: round to next bit...
			v = v.growTo(0, bitSize);

			// Ce n'est pas forcement le bon critère de coupure
			if (v.size() <= 0.5) {
				current.lowInterval = v.neg();

				// Maintenant la petite...
				for(current.highBit = current.lowBit; current.highBit <= 16; ++ current.highBit)
				{
			//		std::cerr << "For low bit " << bit << "\n";

					// Attention:  ici, pour 16, le delta vaut 0 !
					// Pour 15, il vaut 1 ( 1/65536)
					// Pour 14, il vaut 3 / 65536

					Interval v = getHighErrorArea(m, ((1 << (16 - current.highBit)) - 1) * bitSize, 1.0 / 256);
					v = v.remove(current.lowInterval);
					v = v.toClosestBorder();
					v = v.growTo(current.lowInterval.min != 0 ? current.lowInterval.min : current.lowInterval.max, bitSize);
					if (v.size() < bitSize) {
						current.highInterval = v.neg().remove(current.lowInterval);

						if (bestSize == -1 || bestSize > current.size()) {
							bestSize = current.size();
							best = current;
						}
						break;
					}
				}
			}
		}

		if (bestSize == -1) {
			throw "Nothing found";
		}

		this->min = imin;
		this->max = imax;
		this->med = imed;
		this->split = this->min + (this->max - this->min) * (best.lowInterval.min != 0 ? best.lowInterval.min : best.lowInterval.max);
		this->shift1 = best.lowInterval.min == 0 ? 16 - best.lowBit : 16 - best.highBit;
		this->shift2 = best.lowInterval.min != 0 ? 16 - best.lowBit : 16 - best.highBit;
		this->data1 = fillTable(this->min, this->split - 1, this->split, this->shift1);
		this->data2 = fillTable(this->split, this->max, this->max, this->shift2);
	}
}

// from-to : inclusive
uint8_t * LookupTable::fillTable(int from, int to, int limit, int shift)
{
	if (from <= to) {
		int count = sizeFor(from, to, shift);
		uint8_t * result = (uint8_t*)malloc(count);
		int dlt = (1 << shift) - 1;
		for(int i = 0; i < count; ++i) {
			int v1 = from + (i << shift);
			int v2 = v1 + dlt;
			if (v2 > limit) {
				v2 = limit;
			}
#ifdef LOOKUPTABLES_CHECKING
			double roundedI = getRoundedI(v1) * 2;
			if (roundedI != v1 + v2) {
				std::cerr << "rounded I error : " << roundedI << " vs " << v1+v2 << "\n";
			}
#endif
			result[i] = getIntValue(v1 + v2, 1);
		}
		return result;
	} else {
		return 0;
	}
}

//int main() {
//	//220ms pour 250000 calculs => 220/250000 = 0.88us
//	for(int max = 255; max < 65536; ++max) {
//		std::cerr << "MAX=" << max << "\n";
//
//		for(double M = 1.0/65536.0; M < 0.4; M= pow(M, 0.99)) {
//			double m = 1 - M;
//			Config best;
//			int bestSize = -1;
//
//			Config current;
//
//			LookupTable table;
//			table.min = 0;
//			table.max = max;
//
//			double bitSize = 1.0/(table.max - table.min + 1);
//
//			// Trouver la plus grande portion couvrable
//			for(current.lowBit = 6; current.lowBit <= 16; ++current.lowBit){
//		//		std::cerr << "For low bit " << bit << "\n";
//				Interval v = getHighErrorArea(m, ((1 << (16 - current.lowBit)) - 1) * bitSize, 1.0 / 256);
//				v = v.toClosestBorder();
//				// FIXME: round to next bit...
//				v = v.growTo(0, bitSize);
//
//				// Ce n'est pas forcement le bon critère de coupure
//				if (v.size() <= 0.5) {
//					current.lowInterval = v.neg();
//
//					// Maintenant la petite...
//					for(current.highBit = current.lowBit; current.highBit <= 16; ++ current.highBit)
//					{
//				//		std::cerr << "For low bit " << bit << "\n";
//
//						// Attention:  ici, pour 16, le delta vaut 0 !
//						// Pour 15, il vaut 1 ( 1/65536)
//						// Pour 14, il vaut 3 / 65536
//
//						Interval v = getHighErrorArea(m, ((1 << (16 - current.highBit)) - 1) * bitSize, 1.0 / 256);
//						v = v.remove(current.lowInterval);
//						v = v.toClosestBorder();
//						v = v.growTo(current.lowInterval.min != 0 ? current.lowInterval.min : current.lowInterval.max, bitSize);
//						if (v.size() < bitSize) {
//							current.highInterval = v.neg().remove(current.lowInterval);
//
//							if (bestSize == -1 || bestSize > current.size()) {
//								bestSize = current.size();
//								best = current;
//							}
//							break;
//						}
//					}
//				}
//			}
//
//			if (bestSize == -1) {
//				std::cerr << "Nothing found at " << m << "\n";
//				continue;
//			}
//			// std::cerr << "Find 80% min at " << lowInterval.min << "-" << lowInterval.max << " : " << lowBit << "\tsize: " << lowInterval.sampledSize(lowBit) << "\n";
//			// std::cerr << "Find 20% max at " << highInterval.min << "-" << highInterval.max << " : " << highBit  << "\tsize: " << highInterval.sampledSize(highBit) << "\n";
//
//
//			table.med = table.min + table.max * m;
//			table.split = table.min + table.max * (best.lowInterval.min != 0 ? best.lowInterval.min : best.lowInterval.max);
//			table.shift1 = best.lowInterval.min == 0 ? 16 - best.lowBit : 16 - best.highBit;
//			table.shift2 = best.lowInterval.min != 0 ? 16 - best.lowBit : 16 - best.highBit;
//
//			int size = table.size();
//
//			//std::cerr << "m=" << table.med << "\t" << table.split << "\t" << size << "\n";
//
//			int errLow = table.getMaxError(0, table.split);
//			int errHigh = table.getMaxError(table.split, table.max);
//			if (errLow  > 1 || errHigh > 1) {
//				std::cerr << "m=" << table.med << "\t" << table.split << "\t" << size << "\n";
//				std::cerr << "errors:\t" << errLow << "\t" << errHigh << "\n";
//			}
//		}
//	}
//}

#ifdef LOOKUPTABLES_CHECKING

void LookupTable::torture() {
	//220ms pour 250000 calculs => 220/250000 = 0.88us
	for(int max = 65535; max >=250; --max) {
		std::cerr << "MAX=" << max << "\n";

		int previmed = -1;
		for(double M = 1.0/65536.0; M < 0.4; M= pow(M, 0.99)) {
			if ((rand() % 8) != 0) continue;
			int imed = M * max;

			if (imed == previmed) {
				continue;
			}
			previmed = imed;
			LookupTable table(0, imed, max);

			int size = table.size();

			//std::cerr << "m=" << table.med << "\tmax=" << table.max << "\t" << table.split << "\t" << size << "\n";

			int errLow = table.getMaxError(0, table.split);
			int errHigh = table.getMaxError(table.split, table.max);
			if (errLow  > 1 || errHigh > 1) {
				std::cerr << "m=" << table.med << "\t" << table.split << "\t" << size << "\n";
				std::cerr << "errors:\t" << errLow << "\t" << errHigh << "\n";
			}
			for(int i = 0; i <= table.max; ++i)
			{
				int vBest = table.getValue(i);
				int vBestRounded = table.getValue(table.getRoundedI(i));

				int vTable = table.fastGet(i);
				if (abs(vBest - vTable)> 1) {
					std::cerr << "m=" << table.med << "\tsplit=" << table.split << "\tx=" << i << "\tvbest=" << vBest << "\tvbestRounded=" << vBestRounded << "\tvfast=" << vTable << "\tdelta=" << abs(vBest - vTable) << "\n";
				}
			}
		}
	}
}

int main() {
	LookupTable::torture();
}
#endif
