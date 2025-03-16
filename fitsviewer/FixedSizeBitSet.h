#ifndef FIXEDSIZEBITSET_H_
#define FIXEDSIZEBITSET_H_

#include <cassert>
#include <cstdint>
#include <string>

class FixedSizeBitSet {
	int length;
	mutable int cardinality;
	uint64_t * words;

    int wordsLength() const;
public:

	FixedSizeBitSet(int length);
	FixedSizeBitSet(const FixedSizeBitSet & copy);
    FixedSizeBitSet(FixedSizeBitSet && move);
    ~FixedSizeBitSet();
	
    FixedSizeBitSet & operator=(const FixedSizeBitSet & other);

	bool get(int offset) const
    {
        assert(offset >= 0 && offset < length);
        int pos = offset >> 6;
        uint64_t bit = ((uint64_t)1) << (offset & 63);
        return (words[pos] & bit) != 0;
    }
	
    void set(int offset, bool b) {
        assert(offset >= 0 && offset < length);
        int pos = offset >> 6;
        uint64_t bit = ((uint64_t)1) << (offset & 63);
        
        uint64_t l = words[pos];
        
        bool current = (l & bit) != 0;
        if (current == b) return;
        if (b) {
            l |= bit;
            if (cardinality != -1) cardinality ++;
        } else {
            l &= ~bit;
            if (cardinality != -1) cardinality --;
        }
        words[pos] = l;
    }

	void set(int offset) {
        assert(offset >= 0 && offset < length);
        set(offset, true);
    }

    void clear(int offset) {
        assert(offset >= 0 && offset < length);
        set(offset, false);
    }
	
    int nextSetBit(int fromIndex) const;
	int nextClearBit(int fromIndex) const;

	FixedSizeBitSet & operator &=(const FixedSizeBitSet & other);
    FixedSizeBitSet & operator |=(const FixedSizeBitSet & other);
    FixedSizeBitSet & operator ^=(const FixedSizeBitSet & other);
    FixedSizeBitSet & operator -=(const FixedSizeBitSet & other);

    //FixedSizeBitSet * shift(int amount) const;
	FixedSizeBitSet shift(int amount) const;
	
    void clear();
    void set();
    void set(bool b);
    void invert();
    
    int getCardinality() const;

    std::string toString() const;
    int size() const;
};


#endif
