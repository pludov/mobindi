#ifndef LOOKUPTABLES_H
#define LOOKUPTABLES_H 1

#include <cstdint>

class LookupTable
{

	uint16_t min, med, max;
	uint16_t split;
	uint8_t shift1, shift2;
	uint8_t * data1;
	uint8_t * data2;
	void init(int min, int median, int max);
	void reset();
	void release();

	// compute a value for an exact point (slow)
	int getValue(double i) const;

	// fixed point arithmetic
	uint8_t getIntValue(int32_t i, uint8_t shift);

	// the closest input value that is used as reference for i
	double getRoundedI(int i);

	// The actual error abs(getValue(i) - getValue(getRoundedI(i)))
	int getError(int i);

	// The max error for a whole range
	int getMaxError(int from, int to);

	uint8_t * fillTable(int from, int to, int limit, int shift);

public:
	LookupTable(int min, int median, int max);
	~LookupTable();

	inline uint8_t fastGet(uint16_t value) const
	{
		if (value < split) {
			if (value <= min) {
				return 0;
			}
			return data1[(value - min) >> shift1];
		} else {
			if (value >= max) {
				return 255;
			}
			return data2[(value - split) >> shift2];
		}
	}

	int size() const;

#ifdef LOOKUPTABLES_CHECKING
	static void torture();
#endif

};


#endif
