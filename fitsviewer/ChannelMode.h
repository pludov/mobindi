#ifndef CHANNELMODE_H_
#define CHANNELMODE_H_


class ChannelMode {
public:
	const int channelCount;
	ChannelMode(int channelCount) :
		channelCount(channelCount)
	{
	}

	int getChannelId(int x, int y) const
	{
		if (channelCount == 1) return 0;
		return (x & 1) + (y & 1);
	}
};

#endif
